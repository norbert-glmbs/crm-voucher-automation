import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { buildBrazeAppUsageUrl } from '../../src/config';
import { isAtTargetDestination, loginToBraze } from '../../src/website/auth';

const ENV_ID = 'test-env-id';
const TARGET_URL = buildBrazeAppUsageUrl(ENV_ID);

test('logs into a mocked Braze username and password flow and stores auth state', async ({
  page,
}, testInfo) => {
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.origin !== 'https://dashboard-01.braze.com') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (requestUrl.pathname === '/sign_in' || requestUrl.pathname === '/users/sign_in') {
      await route.fulfill({
        contentType: 'text/html',
        body: loginPageHtml(),
      });
      return;
    }

    if (requestUrl.pathname === `/dashboard/app_usage/${ENV_ID}`) {
      const cookies = await page.context().cookies('https://dashboard-01.braze.com');
      const hasSession = cookies.some((cookie) => cookie.name === 'mock_braze_session');

      if (!hasSession) {
        await route.fulfill({
          contentType: 'text/html',
          body: loginPageHtml('/sign_in'),
        });
        return;
      }

      await route.fulfill({
        contentType: 'text/html',
        body: '<main><h1>App Usage</h1></main>',
      });
      return;
    }

    await route.fulfill({ status: 404, body: 'Not mocked' });
  });

  const authStatePath = testInfo.outputPath('braze-auth-state.json');
  const result = await loginToBraze(page, {
    targetUrl: TARGET_URL,
    username: 'operator@example.com',
    password: 'correct-password',
    authStatePath,
    navigationTimeoutMs: 5_000,
    mfaTimeoutMs: 5_000,
  });

  expect(result.status).toBe('logged-in');
  expect(isAtTargetDestination(page.url(), TARGET_URL)).toBe(true);

  const authState = JSON.parse(await readFile(authStatePath, 'utf8'));
  expect(authState.cookies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'mock_braze_session',
        value: 'active',
      }),
    ]),
  );
});

function loginPageHtml(replacePath?: string): string {
  return `
    <form>
      <label>Email <input name="email" type="email" autocomplete="username" required /></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
      <button type="submit">Log in</button>
    </form>
    <script>
      if (${JSON.stringify(Boolean(replacePath))}) {
        window.history.replaceState(null, '', ${JSON.stringify(replacePath || '')});
      }

      document.querySelector('form').addEventListener('submit', (event) => {
        event.preventDefault();

        if (!document.querySelector('input[name="password"]').value) {
          return;
        }

        document.cookie = 'mock_braze_session=active; Path=/; SameSite=Lax';
        window.location.href = ${JSON.stringify(`/dashboard/app_usage/${ENV_ID}?locale=en`)};
      });
    </script>
  `;
}
