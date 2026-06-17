import { expect, test } from '@playwright/test';
import { loadBrazeLoginConfig } from '../../src/config';
import { isAtTargetDestination, loginToBraze } from '../../src/website/auth';
import { printActiveVoucherRowsFromBraze } from '../../src/website/vouchers';
import {
  brazeManualSkipMessage,
  getReadableFilePath,
  shouldRunBrazeManualSpec,
} from './support/brazeManual';

test.skip(
  !shouldRunBrazeManualSpec('RUN_BRAZE_VOUCHERS'),
  brazeManualSkipMessage('RUN_BRAZE_VOUCHERS', 'scan real Braze vouchers'),
);

test('logs into Braze and prints active voucher balances', async ({ browser }) => {
  const config = loadBrazeLoginConfig();
  const existingAuthStatePath = await getReadableFilePath(config.authStatePath);
  const context = await browser.newContext(
    existingAuthStatePath ? { storageState: existingAuthStatePath } : {},
  );
  const page = await context.newPage();

  try {
    const result = await loginToBraze(page, {
      ...config,
      targetUrl: config.vouchersUrl,
    });

    expect(result.authStatePath).toBe(config.authStatePath);

    await printActiveVoucherRowsFromBraze(page, {
      vouchersUrl: config.vouchersUrl,
      navigationTimeoutMs: config.navigationTimeoutMs,
      tableTimeoutMs: config.navigationTimeoutMs,
    });

    expect(isAtTargetDestination(page.url(), config.vouchersUrl)).toBe(true);
  } finally {
    await context.close();
  }
});
