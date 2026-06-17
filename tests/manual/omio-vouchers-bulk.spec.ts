import { expect, test, type TestInfo } from '@playwright/test';
import { requestOmioAccessToken } from '../../src/api/omioAuth';
import {
  DEFAULT_VOUCHERS_BULK_JOB_BODY_PATH,
  approveOmioVouchersBulkJob,
  createOmioVouchersBulkJob,
  downloadOmioVouchersBulkJobVouchers,
  loadVouchersBulkJobBody,
  readOmioVouchersBulkJobId,
  waitForOmioVouchersBulkJobCompletion,
} from '../../src/api/omioVouchersBulk';
import { loadOmioVoucherApiConfig } from '../../src/config';
import { manualSkipMessage, shouldRunManualSpec } from './support/manualFlow';

const EXISTING_OMIO_VOUCHERS_BULK_JOB_ID_ENV =
  'OMIO_VOUCHERS_BULK_JOB_ID';

test.skip(
  !shouldRunManualSpec('RUN_OMIO_VOUCHERS_BULK'),
  manualSkipMessage(
    'RUN_OMIO_VOUCHERS_BULK',
    'create, approve, wait for, and download an Omio vouchers bulk job, or download an existing job',
  ),
);

test(
  'creates, approves, waits for, and downloads an Omio vouchers bulk job, or downloads an existing job',
  async ({}, testInfo) => {
    test.setTimeout(10 * 60 * 1_000);

    try {
      const config = loadOmioVoucherApiConfig();
      const token = await requestOmioAccessToken(config);
      const existingJobId =
        process.env[EXISTING_OMIO_VOUCHERS_BULK_JOB_ID_ENV]?.trim();

      if (existingJobId) {
        console.log(
          `${EXISTING_OMIO_VOUCHERS_BULK_JOB_ID_ENV} is set; downloading vouchers for existing Omio vouchers bulk job ${existingJobId}.`,
        );
        await downloadVouchersForJob({
          baseUrl: config.baseUrl,
          accessToken: token.accessToken,
          jobId: existingJobId,
          testInfo,
        });
        return;
      }

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

      await downloadVouchersForJob({
        baseUrl: config.baseUrl,
        accessToken: token.accessToken,
        jobId,
        testInfo,
      });
    } catch (error) {
      console.error('Omio vouchers bulk job flow failed:', error);
      throw error;
    }
  },
);

async function downloadVouchersForJob({
  baseUrl,
  accessToken,
  jobId,
  testInfo,
}: {
  baseUrl: string;
  accessToken: string;
  jobId: string;
  testInfo: TestInfo;
}): Promise<void> {
  const downloadPath = testInfo.outputPath(
    `omio-vouchers-bulk-${sanitizeFileName(jobId)}.csv`,
  );
  const download = await downloadOmioVouchersBulkJobVouchers({
    baseUrl,
    accessToken,
    jobId,
    outputPath: downloadPath,
    onRetry: (error, attempt, maxAttempts, retryDelayMs) => {
      console.log(
        `Omio vouchers bulk job ${jobId} vouchers download attempt ${attempt}/${maxAttempts} failed: ${error.message}; waiting ${
          retryDelayMs / 1_000
        } seconds before retrying.`,
      );
    },
  });

  console.log(
    `Downloaded Omio vouchers bulk job ${jobId} vouchers to ${download.outputPath} (${download.byteLength} bytes).`,
  );

  expect(download.status).toBeGreaterThanOrEqual(200);
  expect(download.status).toBeLessThan(300);
  expect(download.byteLength).toBeGreaterThan(0);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
