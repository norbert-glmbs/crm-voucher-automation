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
  loadOmioVoucherApiConfig,
  loadOmioVouchersBulkSelectedReplenishments,
  type BrazeLoginConfig,
  type OmioVoucherApiConfig,
} from '../../src/config';
import { isAtTargetDestination, loginToBraze } from '../../src/website/auth';
import {
  findOmioVouchersBulkJobIdFromDisplayName,
  goToBrazeVouchersPage,
  readActiveVoucherRows,
  type ActiveVoucherRow,
  uploadCsvToActiveVoucherRowFromBraze,
} from '../../src/website/vouchers';
import {
  getReadableFilePath,
  manualSkipMessage,
  shouldRunManualSpec,
} from './support/manualFlow';

test.skip(
  !shouldRunManualSpec('RUN_OMIO_VOUCHERS_BULK_REPLENISH_SELECTED'),
  manualSkipMessage(
    'RUN_OMIO_VOUCHERS_BULK_REPLENISH_SELECTED',
    'replenish selected Braze Promotion Code lists with configured Omio voucher quantities',
  ),
);

test(
  'replenishes selected Braze Promotion Code lists with Omio vouchers bulk jobs',
  async ({ browser }, testInfo) => {
    test.setTimeout(30 * 60 * 1_000);

    const brazeConfig = loadBrazeLoginConfig();
    const selectedReplenishments = loadOmioVouchersBulkSelectedReplenishments();
    const existingAuthStatePath = await getReadableFilePath(brazeConfig.authStatePath);
    const context = await browser.newContext(
      existingAuthStatePath ? { storageState: existingAuthStatePath } : {},
    );
    const page = await context.newPage();

    try {
      await loginToBraze(page, { ...brazeConfig, targetUrl: brazeConfig.vouchersUrl });
      expect(isAtTargetDestination(page.url(), brazeConfig.vouchersUrl)).toBe(true);

      await goToBrazeVouchersPage(
        page,
        brazeConfig.vouchersUrl,
        brazeConfig.navigationTimeoutMs,
      );
      const activeRows = await readActiveVoucherRows(
        page,
        brazeConfig.navigationTimeoutMs,
      );
      const selectedRows = selectedReplenishments.map((selection) => ({
        ...selection,
        row: findSelectedActiveVoucherRow(activeRows, selection.campaignName),
      }));
      const omioConfig = loadOmioVoucherApiConfig();
      const token = await requestOmioAccessToken(omioConfig);

      for (const selection of selectedRows) {
        const sourceJobId = findOmioVouchersBulkJobIdFromDisplayName(
          selection.row.displayName,
        );

        if (!sourceJobId) {
          throw new Error(
            `Selected Braze Promotion Code list ${selection.campaignName} does not contain a source Omio vouchers bulk job id in the ..._jobId_{jobId}_... format.`,
          );
        }

        const sourceJob = await getOmioVouchersBulkJob({
          baseUrl: omioConfig.baseUrl,
          accessToken: token.accessToken,
          jobId: sourceJobId,
        });
        const batchSizeChunks = splitOmioVouchersBulkBatchSize(selection.batchSize);

        console.log(
          `Replenishing selected Braze Promotion Code list ${selection.campaignName} with ${selection.batchSize} voucher(s).`,
        );

        for (const [chunkIndex, chunkBatchSize] of batchSizeChunks.entries()) {
          const csvPath = await createCompletedVouchersBulkJobAndDownload({
            omioConfig,
            token,
            body: buildOmioVouchersBulkJobBodyFromExistingJob(
              sourceJob.body,
              chunkBatchSize,
            ),
            targetDisplayName: selection.row.displayName,
            testInfo,
          });

          console.log(
            `Uploading voucher chunk ${chunkIndex + 1}/${batchSizeChunks.length} to ${selection.campaignName}.`,
          );
          await uploadDownloadedVouchersToBrazePromotionCodeList({
            page,
            brazeConfig,
            targetRow: selection.row,
            filePath: csvPath,
          });
        }
      }
    } finally {
      await context.close();
    }
  },
);

function findSelectedActiveVoucherRow(
  activeRows: ActiveVoucherRow[],
  campaignName: string,
): ActiveVoucherRow {
  const matchingRows = activeRows.filter((row) => row.displayName === campaignName);

  if (matchingRows.length === 1) {
    return matchingRows[0];
  }

  if (matchingRows.length === 0) {
    throw new Error(
      `Selected Braze Promotion Code list ${campaignName} was not found among ACTIVE lists.`,
    );
  }

  throw new Error(
    `Selected Braze Promotion Code list ${campaignName} matched multiple ACTIVE lists.`,
  );
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
  const jobId = readOmioVouchersBulkJobId(response.body);

  await approveOmioVouchersBulkJob({
    baseUrl: omioConfig.baseUrl,
    accessToken: token.accessToken,
    jobId,
  });
  await waitForOmioVouchersBulkJobCompletion({
    baseUrl: omioConfig.baseUrl,
    accessToken: token.accessToken,
    jobId,
    onWaiting: (jobStatus, pollIntervalMs) => {
      console.log(
        `Omio vouchers bulk job ${jobId} status is ${jobStatus}; waiting ${pollIntervalMs / 1_000} seconds before retrying.`,
      );
    },
  });

  const downloadPath = testInfo.outputPath(
    `omio-vouchers-bulk-${sanitizeFileName(jobId)}-${sanitizeFileName(targetDisplayName)}.csv`,
  );
  const download = await downloadOmioVouchersBulkJobVouchers({
    baseUrl: omioConfig.baseUrl,
    accessToken: token.accessToken,
    jobId,
    outputPath: downloadPath,
  });
  expect(download.byteLength).toBeGreaterThan(0);

  return download.outputPath;
}

async function uploadDownloadedVouchersToBrazePromotionCodeList({
  page,
  brazeConfig,
  targetRow,
  filePath,
}: {
  page: Page;
  brazeConfig: BrazeLoginConfig;
  targetRow: ActiveVoucherRow;
  filePath: string;
}): Promise<void> {
  const uploadResult = await uploadCsvToActiveVoucherRowFromBraze(page, {
    vouchersUrl: brazeConfig.vouchersUrl,
    filePath,
    targetDisplayName: targetRow.displayName,
    targetDetailUrl: targetRow.detailUrl,
    targetRow,
    navigationTimeoutMs: brazeConfig.navigationTimeoutMs,
    tableTimeoutMs: brazeConfig.navigationTimeoutMs,
    log: console.log,
  });

  expect(uploadResult.displayName).toBe(targetRow.displayName);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'value';
}
