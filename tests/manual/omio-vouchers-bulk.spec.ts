import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { requestOmioAccessToken, type OmioAccessToken } from '../../src/api/omioAuth';
import {
  type OmioVouchersBulkJobBody,
  approveOmioVouchersBulkJob,
  buildOmioVouchersBulkJobBodyFromExistingJob,
  createOmioVouchersBulkJob,
  downloadOmioVouchersBulkJobVouchers,
  getOmioVouchersBulkJob,
  readOmioVouchersBulkJobId,
  splitOmioVouchersBulkBatchSize,
  waitForOmioVouchersBulkJobCompletion,
} from '../../src/api/omioVouchersBulk';
import {
  loadBrazeLoginConfig,
  loadMinCodesThreshold,
  loadOmioVoucherApiConfig,
  loadReplenishBatchSize,
  type BrazeLoginConfig,
  type OmioVoucherApiConfig,
} from '../../src/config';
import { isAtTargetDestination, loginToBraze } from '../../src/website/auth';
import {
  findOmioVouchersBulkJobIdFromDisplayName,
  printActiveVoucherRowsBelowThresholdFromBraze,
  type ActiveVoucherRow,
  uploadCsvToActiveVoucherRowFromBraze,
} from '../../src/website/vouchers';
import {
  getReadableFilePath,
  manualSkipMessage,
  shouldRunManualSpec,
} from './support/manualFlow';

type ActiveVoucherRowWithSourceJobId = ActiveVoucherRow & {
  sourceJobId: string;
};

test.skip(
  !shouldRunManualSpec('RUN_OMIO_VOUCHERS_BULK_REPLENISH'),
  manualSkipMessage(
    'RUN_OMIO_VOUCHERS_BULK_REPLENISH',
    'scan Braze for low Promotion Code lists and replenish them with Omio vouchers bulk jobs',
  ),
);

test(
  'replenishes low Braze Promotion Code lists with Omio vouchers bulk jobs',
  async ({ browser }, testInfo) => {
    test.setTimeout(30 * 60 * 1_000);

    const brazeConfig = loadBrazeLoginConfig();
    const minCodesThreshold = loadMinCodesThreshold();
    const batchSize = loadReplenishBatchSize();
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

      const rowsWithSourceJobIds = findRowsWithSourceJobIds(
        rowsBelowThreshold,
        console.log,
      );

      if (rowsWithSourceJobIds.length === 0) {
        console.log(
          'No low Braze Promotion Code lists included a source Omio vouchers bulk job id; no Omio vouchers bulk jobs will be created.',
        );
        return;
      }

      const omioConfig = loadOmioVoucherApiConfig();
      const token = await requestOmioAccessToken(omioConfig);
      const batchSizeChunks = splitOmioVouchersBulkBatchSize(batchSize);

      if (batchSizeChunks.length > 1) {
        console.log(
          `REPLENISH_BATCH_SIZE[${batchSize}] exceeds the Omio per-request limit; splitting into chunks: ${batchSizeChunks.join(', ')}.`,
        );
      }

      for (const row of rowsWithSourceJobIds) {
        const sourceJob = await getVouchersBulkSourceJob({
          omioConfig,
          token,
          sourceJobId: row.sourceJobId,
        });

        for (const [chunkIndex, chunkBatchSize] of batchSizeChunks.entries()) {
          const body = buildOmioVouchersBulkJobBodyFromExistingJob(
            sourceJob.body,
            chunkBatchSize,
          );

          console.log(
            `Creating Omio vouchers bulk job ${chunkIndex + 1}/${
              batchSizeChunks.length
            } for Braze Promotion Code list ${
              row.displayName
            } from source job ${row.sourceJobId} with batchSize ${chunkBatchSize}.`,
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
            targetDisplayName: row.displayName,
            filePath: csvPath,
          });
        }

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

function findRowsWithSourceJobIds(
  rows: ActiveVoucherRow[],
  log: (message: string) => void,
): ActiveVoucherRowWithSourceJobId[] {
  const rowsWithSourceJobIds: ActiveVoucherRowWithSourceJobId[] = [];

  for (const row of rows) {
    const sourceJobId = findOmioVouchersBulkJobIdFromDisplayName(
      row.displayName,
    );

    if (!sourceJobId) {
      log(
        `Skipping Braze Promotion Code list ${row.displayName}: display name does not contain a source Omio vouchers bulk job id in the ..._jobId_{jobId}_... format.`,
      );
      continue;
    }

    rowsWithSourceJobIds.push({
      ...row,
      sourceJobId,
    });
  }

  return rowsWithSourceJobIds;
}

async function getVouchersBulkSourceJob({
  omioConfig,
  token,
  sourceJobId,
}: {
  omioConfig: OmioVoucherApiConfig;
  token: OmioAccessToken;
  sourceJobId: string;
}): Promise<Awaited<ReturnType<typeof getOmioVouchersBulkJob>>> {
  const sourceJob = await getOmioVouchersBulkJob({
    baseUrl: omioConfig.baseUrl,
    accessToken: token.accessToken,
    jobId: sourceJobId,
  });

  expect(sourceJob.status).toBeGreaterThanOrEqual(200);
  expect(sourceJob.status).toBeLessThan(300);

  return sourceJob;
}

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
  targetDisplayName,
  filePath,
}: {
  page: Page;
  brazeConfig: BrazeLoginConfig;
  targetDisplayName: ActiveVoucherRow['displayName'];
  filePath: string;
}): Promise<void> {
  const uploadResult = await uploadCsvToActiveVoucherRowFromBraze(page, {
    vouchersUrl: brazeConfig.vouchersUrl,
    filePath,
    targetDisplayName,
    navigationTimeoutMs: brazeConfig.navigationTimeoutMs,
    tableTimeoutMs: brazeConfig.navigationTimeoutMs,
    log: console.log,
  });

  expect(uploadResult.filePath).toBe(filePath);
  expect(uploadResult.displayName).toBe(targetDisplayName);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'value';
}
