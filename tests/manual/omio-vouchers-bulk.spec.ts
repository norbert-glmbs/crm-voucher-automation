import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { requestOmioAccessToken, type OmioAccessToken } from '../../src/api/omioAuth';
import {
  DEFAULT_VOUCHERS_BULK_JOB_BODY_PATH,
  type OmioVouchersBulkJobBody,
  approveOmioVouchersBulkJob,
  createOmioVouchersBulkJob,
  downloadOmioVouchersBulkJobVouchers,
  loadVouchersBulkJobBody,
  readOmioVouchersBulkJobId,
  waitForOmioVouchersBulkJobCompletion,
} from '../../src/api/omioVouchersBulk';
import {
  loadBrazeLoginConfig,
  loadMinCodesThreshold,
  loadOmioVoucherApiConfig,
  type BrazeLoginConfig,
  type OmioVoucherApiConfig,
} from '../../src/config';
import { isAtTargetDestination, loginToBraze } from '../../src/website/auth';
import {
  printActiveVoucherRowsBelowThresholdFromBraze,
  type ActiveVoucherRow,
  uploadCsvToActiveVoucherRowBelowThresholdFromBraze,
} from '../../src/website/vouchers';
import {
  getReadableFilePath,
  manualSkipMessage,
  shouldRunManualSpec,
} from './support/manualFlow';

const EXISTING_OMIO_VOUCHERS_BULK_JOB_ID_ENV =
  'OMIO_VOUCHERS_BULK_JOB_ID';

test.skip(
  !shouldRunManualSpec('RUN_OMIO_VOUCHERS_BULK'),
  manualSkipMessage(
    'RUN_OMIO_VOUCHERS_BULK',
    'scan Braze for low Promotion Code lists and replenish them with Omio vouchers bulk jobs',
  ),
);

test(
  'replenishes low Braze Promotion Code lists with Omio vouchers bulk jobs',
  async ({ browser }, testInfo) => {
    test.setTimeout(30 * 60 * 1_000);

    const brazeConfig = loadBrazeLoginConfig();
    const minCodesThreshold = loadMinCodesThreshold();
    const existingAuthStatePath = await getReadableFilePath(
      brazeConfig.authStatePath,
    );
    const context = await browser.newContext(
      existingAuthStatePath ? { storageState: existingAuthStatePath } : {},
    );
    const page = await context.newPage();

    try {
      const loginResult = await loginToBraze(page, {
        ...brazeConfig,
        targetUrl: brazeConfig.vouchersUrl,
      });

      expect(loginResult.authStatePath).toBe(brazeConfig.authStatePath);
      expect(isAtTargetDestination(page.url(), brazeConfig.vouchersUrl)).toBe(
        true,
      );

      const rowsBelowThreshold =
        await printActiveVoucherRowsBelowThresholdFromBraze(page, {
          vouchersUrl: brazeConfig.vouchersUrl,
          minCodesThreshold,
          navigationTimeoutMs: brazeConfig.navigationTimeoutMs,
          tableTimeoutMs: brazeConfig.navigationTimeoutMs,
          log: console.log,
        });

      if (rowsBelowThreshold.length === 0) {
        console.log(
          `No Braze Promotion Code lists are below MIN_CODES_THRESHOLD[${minCodesThreshold}]; no Omio vouchers bulk jobs will be created.`,
        );
        return;
      }

      console.log(
        `Found ${rowsBelowThreshold.length} Braze Promotion Code list(s) below MIN_CODES_THRESHOLD[${minCodesThreshold}].`,
      );

      const omioConfig = loadOmioVoucherApiConfig();
      const token = await requestOmioAccessToken(omioConfig);
      const existingJobId =
        process.env[EXISTING_OMIO_VOUCHERS_BULK_JOB_ID_ENV]?.trim();

      if (existingJobId) {
        const targetRow = rowsBelowThreshold[0];

        if (rowsBelowThreshold.length > 1) {
          console.log(
            `${EXISTING_OMIO_VOUCHERS_BULK_JOB_ID_ENV} provides one existing Omio job; it will be uploaded only to ${targetRow.displayName}.`,
          );
        }

        console.log(
          `${EXISTING_OMIO_VOUCHERS_BULK_JOB_ID_ENV} is set; downloading vouchers for existing Omio vouchers bulk job ${existingJobId}.`,
        );
        const csvPath = await downloadVouchersForJob({
          baseUrl: omioConfig.baseUrl,
          accessToken: token.accessToken,
          jobId: existingJobId,
          targetDisplayName: targetRow.displayName,
          testInfo,
        });
        await uploadDownloadedVouchersToBrazePromotionCodeList({
          page,
          brazeConfig,
          minCodesThreshold,
          targetDisplayName: targetRow.displayName,
          filePath: csvPath,
        });
        return;
      }

      const body = await loadVouchersBulkJobBody(
        process.env.OMIO_VOUCHERS_BULK_BODY_PATH ||
          DEFAULT_VOUCHERS_BULK_JOB_BODY_PATH,
      );

      for (const row of rowsBelowThreshold) {
        console.log(
          `Creating Omio vouchers bulk job for Braze Promotion Code list ${row.displayName}.`,
        );

        const csvPath = await createCompletedVouchersBulkJobAndDownload({
          omioConfig,
          token,
          body,
          targetDisplayName: row.displayName,
          testInfo,
        });

        await uploadDownloadedVouchersToBrazePromotionCodeList({
          page,
          brazeConfig,
          minCodesThreshold,
          targetDisplayName: row.displayName,
          filePath: csvPath,
        });

        console.log(
          `Finished replenishing Braze Promotion Code list ${row.displayName}.`,
        );
      }
    } catch (error) {
      console.error('Braze/Omio vouchers bulk replenishment flow failed:', error);
      throw error;
    } finally {
      await context.close();
    }
  },
);

async function createCompletedVouchersBulkJobAndDownload({
  omioConfig,
  token,
  body,
  targetDisplayName,
  testInfo,
}: {
  omioConfig: OmioVoucherApiConfig;
  token: OmioAccessToken;
  body: OmioVouchersBulkJobBody;
  targetDisplayName: string;
  testInfo: TestInfo;
}): Promise<string> {
  const response = await createOmioVouchersBulkJob({
    baseUrl: omioConfig.baseUrl,
    accessToken: token.accessToken,
    body,
  });

  console.log(JSON.stringify(response.body, null, 2));

  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);

  const jobId = readOmioVouchersBulkJobId(response.body);
  const approvalResponse = await approveOmioVouchersBulkJob({
    baseUrl: omioConfig.baseUrl,
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
    baseUrl: omioConfig.baseUrl,
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

  return downloadVouchersForJob({
    baseUrl: omioConfig.baseUrl,
    accessToken: token.accessToken,
    jobId,
    targetDisplayName,
    testInfo,
  });
}

async function downloadVouchersForJob({
  baseUrl,
  accessToken,
  jobId,
  targetDisplayName,
  testInfo,
}: {
  baseUrl: string;
  accessToken: string;
  jobId: string;
  targetDisplayName?: string;
  testInfo: TestInfo;
}): Promise<string> {
  const targetSuffix = targetDisplayName
    ? `-${sanitizeFileName(targetDisplayName)}`
    : '';
  const downloadPath = testInfo.outputPath(
    `omio-vouchers-bulk-${sanitizeFileName(jobId)}${targetSuffix}.csv`,
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

  return download.outputPath;
}

async function uploadDownloadedVouchersToBrazePromotionCodeList({
  page,
  brazeConfig,
  minCodesThreshold,
  targetDisplayName,
  filePath,
}: {
  page: Page;
  brazeConfig: BrazeLoginConfig;
  minCodesThreshold: number;
  targetDisplayName: ActiveVoucherRow['displayName'];
  filePath: string;
}): Promise<void> {
  const uploadResult = await uploadCsvToActiveVoucherRowBelowThresholdFromBraze(
    page,
    {
      vouchersUrl: brazeConfig.vouchersUrl,
      minCodesThreshold,
      filePath,
      targetDisplayName,
      navigationTimeoutMs: brazeConfig.navigationTimeoutMs,
      tableTimeoutMs: brazeConfig.navigationTimeoutMs,
      log: console.log,
    },
  );

  expect(uploadResult.filePath).toBe(filePath);
  expect(uploadResult.displayName).toBe(targetDisplayName);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'value';
}
