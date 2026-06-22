import { expect, test, type TestInfo } from '@playwright/test';
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
  loadOmioVoucherApiConfig,
  loadOmioVouchersBulkCreateInputs,
  type OmioVoucherApiConfig,
} from '../../src/config';
import { isAtTargetDestination, loginToBraze } from '../../src/website/auth';
import {
  openNewPromotionCodeListFromBraze,
  uploadCsvToActiveVoucherRowFromBraze,
  uploadCsvToOpenPromotionCodeListFromBraze,
} from '../../src/website/vouchers';
import {
  getReadableFilePath,
  manualSkipMessage,
  shouldRunManualSpec,
} from './support/manualFlow';

test.skip(
  !shouldRunManualSpec('RUN_OMIO_VOUCHERS_BULK_CREATE'),
  manualSkipMessage(
    'RUN_OMIO_VOUCHERS_BULK_CREATE',
    'create a Braze Promotion Code list and populate it from an Omio vouchers bulk job',
  ),
);

test(
  'creates a Braze Promotion Code list from an Omio vouchers bulk job',
  async ({ browser }, testInfo) => {
    test.setTimeout(30 * 60 * 1_000);

    const brazeConfig = loadBrazeLoginConfig();
    const createInputs = loadOmioVouchersBulkCreateInputs();
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

      const newPromotionCodeList = await openNewPromotionCodeListFromBraze(
        page,
        {
          vouchersUrl: brazeConfig.vouchersUrl,
          newVoucherUrl: brazeConfig.newVoucherUrl,
          displayName: createInputs.promotionCodeListName,
          codeSnippetName: createInputs.codeSnippetName,
          navigationTimeoutMs: brazeConfig.navigationTimeoutMs,
          formTimeoutMs: brazeConfig.navigationTimeoutMs,
          log: console.log,
        },
      );

      const omioConfig = loadOmioVoucherApiConfig();
      const token = await requestOmioAccessToken(omioConfig);
      const sourceJob = await getVouchersBulkSourceJob({
        omioConfig,
        token,
        sourceJobId: createInputs.sourceJobId,
      });
      const batchSizeChunks = splitOmioVouchersBulkBatchSize(
        createInputs.targetBatchSize,
      );

      if (batchSizeChunks.length > 1) {
        console.log(
          `TARGET_BATCH_SIZE[${createInputs.targetBatchSize}] exceeds the Omio per-request limit; splitting into chunks: ${batchSizeChunks.join(', ')}.`,
        );
      }

      for (const [chunkIndex, chunkBatchSize] of batchSizeChunks.entries()) {
        const body = buildOmioVouchersBulkJobBodyFromExistingJob(
          sourceJob.body,
          chunkBatchSize,
        );

        console.log(
          `Creating Omio vouchers bulk job ${chunkIndex + 1}/${
            batchSizeChunks.length
          } for new Braze Promotion Code list ${
            createInputs.promotionCodeListName
          } from source job ${
            createInputs.sourceJobId
          } with batchSize ${chunkBatchSize}.`,
        );

        const csvPath = await createCompletedVouchersBulkJobAndDownload({
          omioConfig,
          token,
          body,
          targetDisplayName: createInputs.promotionCodeListName,
          testInfo,
        });

        const uploadResult =
          chunkIndex === 0
            ? await uploadCsvToOpenPromotionCodeListFromBraze(page, {
                filePath: csvPath,
                displayName: newPromotionCodeList.displayName,
                log: console.log,
              })
            : await uploadCsvToActiveVoucherRowFromBraze(page, {
                vouchersUrl: brazeConfig.vouchersUrl,
                filePath: csvPath,
                targetDisplayName: newPromotionCodeList.displayName,
                navigationTimeoutMs: brazeConfig.navigationTimeoutMs,
                tableTimeoutMs: brazeConfig.navigationTimeoutMs,
                log: console.log,
              });

        expect(uploadResult.filePath).toBe(csvPath);
        expect(uploadResult.displayName).toBe(createInputs.promotionCodeListName);
      }

      console.log(
        `Finished creating Braze Promotion Code list ${createInputs.promotionCodeListName}.`,
      );
    } catch (error) {
      console.error('Braze/Omio vouchers bulk create flow failed:', error);
      throw error;
    } finally {
      await context.close();
    }
  },
);

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

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'value';
}
