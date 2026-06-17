import { expect, test } from '@playwright/test';
import { requestOmioAccessToken } from '../../src/api/omioAuth';
import {
  DEFAULT_VOUCHERS_BULK_JOB_BODY_PATH,
  approveOmioVouchersBulkJob,
  createOmioVouchersBulkJob,
  loadVouchersBulkJobBody,
  readOmioVouchersBulkJobId,
  waitForOmioVouchersBulkJobCompletion,
} from '../../src/api/omioVouchersBulk';
import { loadOmioVoucherApiConfig } from '../../src/config';
import { manualSkipMessage, shouldRunManualSpec } from './support/manualFlow';

test.skip(
  !shouldRunManualSpec('RUN_OMIO_VOUCHERS_BULK'),
  manualSkipMessage(
    'RUN_OMIO_VOUCHERS_BULK',
    'create, approve, and wait for an Omio vouchers bulk job',
  ),
);

test('creates, approves, and waits for an Omio vouchers bulk job', async () => {
  test.setTimeout(10 * 60 * 1_000);

  try {
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

    const jobId = readOmioVouchersBulkJobId(response.body);
    const approvalResponse = await approveOmioVouchersBulkJob({
      baseUrl: config.baseUrl,
      accessToken: token.accessToken,
      jobId,
    });

    console.log(JSON.stringify(approvalResponse.body, null, 2));

    expect(approvalResponse.status).toBeGreaterThanOrEqual(200);
    expect(approvalResponse.status).toBeLessThan(300);
    expect(approvalResponse.body).toMatchObject({
      status: 'PENDING',
    });

    const completedResponse = await waitForOmioVouchersBulkJobCompletion({
      baseUrl: config.baseUrl,
      accessToken: token.accessToken,
      jobId,
      onWaiting: (jobStatus, pollIntervalMs) => {
        console.log(
          `Omio vouchers bulk job ${jobId} status is ${jobStatus}; waiting ${
            pollIntervalMs / 1_000
          } seconds before retrying.`,
        );
      },
    });

    console.log(JSON.stringify(completedResponse.body, null, 2));

    expect(completedResponse.status).toBeGreaterThanOrEqual(200);
    expect(completedResponse.status).toBeLessThan(300);
    expect(completedResponse.body).toMatchObject({
      status: 'COMPLETED',
    });
  } catch (error) {
    console.error('Omio vouchers bulk job flow failed:', error);
    throw error;
  }
});
