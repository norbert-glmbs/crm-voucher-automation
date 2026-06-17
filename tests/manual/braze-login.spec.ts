import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loadBrazeLoginConfig } from '../../src/config';
import { isAtTargetDestination, loginToBraze } from '../../src/website/auth';

test.skip(
  process.env.RUN_BRAZE_LOGIN !== 'true',
  'Set RUN_BRAZE_LOGIN=true to run the real Braze login flow.',
);

test('logs into Braze app usage dashboard and stores auth state', async ({ browser }) => {
  const config = loadBrazeLoginConfig();
  const existingAuthStatePath = await getReadableFilePath(config.authStatePath);
  const context = await browser.newContext(
    existingAuthStatePath ? { storageState: existingAuthStatePath } : {},
  );
  const page = await context.newPage();

  try {
    const result = await loginToBraze(page, config);

    expect(result.authStatePath).toBe(config.authStatePath);
    expect(isAtTargetDestination(page.url(), config.targetUrl)).toBe(true);
  } finally {
    await context.close();
  }
});

async function getReadableFilePath(filePath: string): Promise<string | undefined> {
  try {
    await access(filePath, constants.R_OK);
    return filePath;
  } catch {
    return undefined;
  }
}
