import { expect, test } from '@playwright/test';
import { loadBrazeLoginConfig, loadMinCodesThreshold } from '../../src/config';
import { isAtTargetDestination, loginToBraze } from '../../src/website/auth';
import { printActiveVoucherRowsBelowThresholdFromBraze } from '../../src/website/vouchers';
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
  const minCodesThreshold = loadMinCodesThreshold();
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

    await printActiveVoucherRowsBelowThresholdFromBraze(page, {
      vouchersUrl: config.vouchersUrl,
      minCodesThreshold,
      navigationTimeoutMs: config.navigationTimeoutMs,
      tableTimeoutMs: config.navigationTimeoutMs,
    });

    expect(isAtTargetDestination(page.url(), config.vouchersUrl)).toBe(true);
  } finally {
    await context.close();
  }
});
