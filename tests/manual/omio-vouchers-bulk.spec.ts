import { expect, test } from '@playwright/test';
import { requestOmioAccessToken } from '../../src/api/omioAuth';
import {
  DEFAULT_VOUCHERS_BULK_JOB_BODY_PATH,
  createOmioVouchersBulkJob,
  loadVouchersBulkJobBody,
} from '../../src/api/omioVouchersBulk';
import { loadOmioVoucherApiConfig } from '../../src/config';
import { manualSkipMessage, shouldRunManualSpec } from './support/manualFlow';

test.skip(
  !shouldRunManualSpec('RUN_OMIO_VOUCHERS_BULK'),
  manualSkipMessage('RUN_OMIO_VOUCHERS_BULK', 'create an Omio vouchers bulk job'),
);

test('creates an Omio vouchers bulk job', async () => {
  const config = loadOmioVoucherApiConfig();
  const token = await requestOmioAccessToken(config);
  const body = await loadVouchersBulkJobBody(
    process.env.OMIO_VOUCHERS_BULK_BODY_PATH ||
      DEFAULT_VOUCHERS_BULK_JOB_BODY_PATH,
  );

  const response = await createOmioVouchersBulkJob({
    baseUrl: config.baseUrl,
    accessToken: token.accessToken,
    body,
  });

  console.log(JSON.stringify(response.body, null, 2));

  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
});
