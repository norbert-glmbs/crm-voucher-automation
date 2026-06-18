import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';

export type BrazeLoginOptions = {
  targetUrl: string;
  username: string;
  password: string;
  authStatePath: string;
  allowManualMfa?: boolean;
  mfaTimeoutMs?: number;
  navigationTimeoutMs?: number;
};

export type BrazeLoginResult = {
  status: 'already-authenticated' | 'logged-in';
  authStatePath: string;
  finalUrl: string;
};

const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
const DEFAULT_MFA_TIMEOUT_MS = 120_000;

export async function loginToBraze(
  page: Page,
  options: BrazeLoginOptions,
): Promise<BrazeLoginResult> {
  const navigationTimeoutMs =
    options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;
  const mfaTimeoutMs = options.mfaTimeoutMs ?? DEFAULT_MFA_TIMEOUT_MS;

  page.setDefaultTimeout(navigationTimeoutMs);
  page.setDefaultNavigationTimeout(navigationTimeoutMs);

  await page.goto(options.targetUrl, { waitUntil: 'domcontentloaded' });

  if (isAtTargetDestination(page.url(), options.targetUrl)) {
    await saveAuthState(page, options.authStatePath);

    return {
      status: 'already-authenticated',
      authStatePath: options.authStatePath,
      finalUrl: page.url(),
    };
  }

  await fillUsernamePasswordLoginForm(page, options);

  const authenticated = await waitForAuthenticatedDestination(
    page,
    options.targetUrl,
    navigationTimeoutMs,
  );

  if (!authenticated && (await hasAccessChallenge(page))) {
    if (!options.allowManualMfa) {
      throw new Error(
        'Braze login appears to require MFA, CAPTCHA, or another access challenge. Enable BRAZE_LOGIN_ALLOW_MANUAL_MFA for an interactive run, or use an approved service account/session path.',
      );
    }

    const completedManually = await waitForAuthenticatedDestination(
      page,
      options.targetUrl,
      mfaTimeoutMs,
    );

    if (!completedManually) {
      throw new Error(
        `Manual login challenge was not completed within ${mfaTimeoutMs}ms.`,
      );
    }
  } else if (!authenticated) {
    throw new Error(`Braze login did not reach the dashboard. Current URL: ${page.url()}`);
  }

  if (!isAtTargetDestination(page.url(), options.targetUrl)) {
    await page.goto(options.targetUrl, { waitUntil: 'domcontentloaded' });

    const reachedTarget = await waitForTargetDestination(
      page,
      options.targetUrl,
      navigationTimeoutMs,
    );

    if (!reachedTarget) {
      throw new Error(
        `Braze login succeeded, but the target page was not reached. Current URL: ${page.url()} vs Expected URL : ${options.targetUrl}`,
      );
    }
  }

  await saveAuthState(page, options.authStatePath);

  return {
    status: 'logged-in',
    authStatePath: options.authStatePath,
    finalUrl: page.url(),
  };
}

export function isAtTargetDestination(currentUrl: string, targetUrl: string): boolean {
  const current = new URL(currentUrl);
  const target = new URL(targetUrl);

  return current.origin === target.origin && current.pathname === target.pathname;
}

async function fillUsernamePasswordLoginForm(
  page: Page,
  options: BrazeLoginOptions,
): Promise<void> {
  const emailInput = await findVisibleLocator(
    [
      page.getByLabel(/email|username/i).first(),
      page.getByPlaceholder(/email|username/i).first(),
      page.locator('input[type="email"]').first(),
      page
        .locator(
          'input[name="email"], input[name="username"], input[id*="email"], input[autocomplete="username"]',
        )
        .first(),
    ],
    15_000,
    'Braze email input',
  );

  await emailInput.fill(options.username);

  let passwordInput = await maybeFindVisibleLocator(passwordLocators(page), 2_000);

  if (!passwordInput) {
    const continueButton = await maybeFindVisibleLocator(
      [
        page.getByRole('button', { name: /continue|next|sign in|log in/i }).first(),
        page.locator('button[type="submit"], input[type="submit"]').first(),
      ],
      5_000,
    );

    if (continueButton) {
      await continueButton.click();
    }

    passwordInput = await findVisibleLocator(
      passwordLocators(page),
      15_000,
      'Braze password input',
    );
  }

  await passwordInput.fill(options.password);

  const submitButton = await maybeFindVisibleLocator(
    [
      page.getByRole('button', { name: /log in|login|sign in|continue/i }).first(),
      page.locator('button[type="submit"], input[type="submit"]').first(),
    ],
    5_000,
  );

  if (submitButton) {
    await submitButton.click();
    return;
  }

  await passwordInput.press('Enter');
}

function passwordLocators(page: Page): Locator[] {
  return [
    page.getByLabel(/password/i).first(),
    page.getByPlaceholder(/password/i).first(),
    page.locator('input[type="password"]').first(),
    page.locator('input[name="password"], input[autocomplete="current-password"]').first(),
  ];
}

async function waitForAuthenticatedDestination(
  page: Page,
  targetUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  if (isAuthenticatedDestinationUrl(page.url(), targetUrl)) {
    return true;
  }

  try {
    await page.waitForURL(
      (url) => isAuthenticatedDestinationUrl(url.toString(), targetUrl),
      {
        timeout: timeoutMs,
        waitUntil: 'domcontentloaded',
      },
    );
    return true;
  } catch {
    return false;
  }
}

async function waitForTargetDestination(
  page: Page,
  targetUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  if (isAtTargetDestination(page.url(), targetUrl)) {
    return true;
  }

  try {
    await page.waitForURL((url) => isAtTargetDestination(url.toString(), targetUrl), {
      timeout: timeoutMs,
      waitUntil: 'domcontentloaded',
    });
    return true;
  } catch {
    return false;
  }
}

function isAuthenticatedDestinationUrl(currentUrl: string, targetUrl: string): boolean {
  const current = new URL(currentUrl);
  const target = new URL(targetUrl);

  return (
    current.origin === target.origin &&
    (current.pathname.startsWith('/dashboard') ||
      isAtTargetDestination(currentUrl, targetUrl)) &&
    !isAuthenticationPath(current.pathname)
  );
}

function isAuthenticationPath(pathname: string): boolean {
  return /\/(login|sign_in|signin|users\/sign_in|session|sessions|oauth|sso)(\/|$)/i.test(
    pathname,
  );
}

async function hasAccessChallenge(page: Page): Promise<boolean> {
  return Boolean(
    await maybeFindVisibleLocator(
      [
        page
          .getByText(
            /captcha|verification code|two-factor|two factor|multi-factor|mfa|authenticator|security code/i,
          )
          .first(),
        page
          .locator(
            'input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="code" i], input[id*="otp" i], input[id*="code" i]',
          )
          .first(),
      ],
      1_000,
    ),
  );
}

async function findVisibleLocator(
  candidates: Locator[],
  timeoutMs: number,
  description: string,
): Promise<Locator> {
  const locator = await maybeFindVisibleLocator(candidates, timeoutMs);

  if (!locator) {
    throw new Error(`${description} was not visible within ${timeoutMs}ms.`);
  }

  return locator;
}

async function maybeFindVisibleLocator(
  candidates: Locator[],
  timeoutMs: number,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    for (const candidate of candidates) {
      const remainingMs = Math.max(deadline - Date.now(), 1);
      const probeTimeoutMs = Math.min(remainingMs, 250);

      try {
        await candidate.waitFor({ state: 'visible', timeout: probeTimeoutMs });
        return candidate;
      } catch {
        // Try the next candidate selector until the overall timeout expires.
      }
    }
  }

  return null;
}

async function saveAuthState(page: Page, authStatePath: string): Promise<void> {
  await mkdir(path.dirname(authStatePath), { recursive: true });
  await page.context().storageState({ path: authStatePath });
}
