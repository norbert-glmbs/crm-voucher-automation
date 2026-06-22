import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type OmioVouchersBulkJobBody = {
  batchSize: number;
  uppercaseIds: boolean;
  template: Record<string, unknown>;
  publisherName?: string;
  publisherEmailDetails?: Record<string, unknown>;
  ruleName?: string;
};

export type OmioVouchersBulkJobConfig = {
  baseUrl: string;
  accessToken: string;
  body: OmioVouchersBulkJobBody;
};

export type OmioVouchersBulkJobApprovalConfig = {
  baseUrl: string;
  accessToken: string;
  jobId: string;
};

export type OmioVouchersBulkJobStatusConfig = {
  baseUrl: string;
  accessToken: string;
  jobId: string;
};

export type OmioVouchersBulkJobCompletionConfig =
  OmioVouchersBulkJobStatusConfig & {
    pollIntervalMs?: number;
    wait?: (durationMs: number) => Promise<void>;
    onWaiting?: (jobStatus: string, pollIntervalMs: number) => void;
  };

export type OmioVouchersBulkJobDownloadConfig =
  OmioVouchersBulkJobStatusConfig & {
    outputPath: string;
    maxAttempts?: number;
    retryDelayMs?: number;
    wait?: (durationMs: number) => Promise<void>;
    onRetry?: (
      error: Error,
      attempt: number,
      maxAttempts: number,
      retryDelayMs: number,
    ) => void;
  };

export type OmioVouchersBulkJobResponse = {
  status: number;
  body: unknown;
};

export type OmioVouchersBulkJobDownload = {
  status: number;
  outputPath: string;
  byteLength: number;
};

type FetchRequestInit = {
  method: 'POST' | 'PATCH' | 'GET';
  headers: Record<string, string>;
  body?: string;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText?: string;
  text: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

type FetchLike = (
  url: string,
  init: FetchRequestInit,
) => Promise<FetchResponseLike>;

const APPROVE_VOUCHERS_BULK_JOB_BODY = {
  approvalStatus: 'APPROVED',
};
const EXPECTED_APPROVAL_JOB_STATUS = 'PENDING';
const COMPLETED_JOB_STATUS = 'COMPLETED';
const DEFAULT_COMPLETION_POLL_INTERVAL_MS = 5_000;
const DEFAULT_DOWNLOAD_MAX_ATTEMPTS = 3;
const DEFAULT_DOWNLOAD_RETRY_DELAY_MS = 5_000;
export const MAX_OMIO_VOUCHERS_BULK_BATCH_SIZE = 100_000;

export async function createOmioVouchersBulkJob(
  config: OmioVouchersBulkJobConfig,
  fetcher: FetchLike = defaultFetch,
): Promise<OmioVouchersBulkJobResponse> {
  const response = await fetcher(buildOmioVouchersBulkJobUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      Accept: '*/*',
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config.body),
  });
  const responseText = await response.text();
  const responseBody = parseResponseBody(responseText);

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : '';

    throw new Error(
      `Omio vouchers bulk job request failed with status ${response.status}${statusText}: ${responseText}`,
    );
  }
  return {
    status: response.status,
    body: responseBody,
  };
}

export async function approveOmioVouchersBulkJob(
  config: OmioVouchersBulkJobApprovalConfig,
  fetcher: FetchLike = defaultFetch,
): Promise<OmioVouchersBulkJobResponse> {
  const response = await fetcher(
    buildOmioVouchersBulkJobUrl(config.baseUrl, config.jobId),
    {
      method: 'PATCH',
      headers: {
        Accept: '*/*',
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(APPROVE_VOUCHERS_BULK_JOB_BODY),
    },
  );
  const responseText = await response.text();
  const responseBody = parseResponseBody(responseText);

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : '';

    throw new Error(
      `Omio vouchers bulk job approval request failed with status ${response.status}${statusText}: ${responseText}`,
    );
  }

  const jobStatus = readOmioVouchersBulkJobStatus(
    responseBody,
    'Omio vouchers bulk job approval response',
  );

  if (jobStatus !== EXPECTED_APPROVAL_JOB_STATUS) {
    throw new Error(
      `Omio vouchers bulk job approval returned job status ${jobStatus}; expected ${EXPECTED_APPROVAL_JOB_STATUS}.`,
    );
  }

  return {
    status: response.status,
    body: responseBody,
  };
}

export async function getOmioVouchersBulkJob(
  config: OmioVouchersBulkJobStatusConfig,
  fetcher: FetchLike = defaultFetch,
): Promise<OmioVouchersBulkJobResponse> {
  const response = await fetcher(
    buildOmioVouchersBulkJobUrl(config.baseUrl, config.jobId),
    {
      method: 'GET',
      headers: {
        Accept: '*/*',
        Authorization: `Bearer ${config.accessToken}`,
      },
    },
  );
  const responseText = await response.text();
  const responseBody = parseResponseBody(responseText);

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : '';

    throw new Error(
      `Omio vouchers bulk job status request failed with status ${response.status}${statusText}: ${responseText}`,
    );
  }

  return {
    status: response.status,
    body: responseBody,
  };
}

export async function waitForOmioVouchersBulkJobCompletion(
  config: OmioVouchersBulkJobCompletionConfig,
  fetcher: FetchLike = defaultFetch,
): Promise<OmioVouchersBulkJobResponse> {
  const pollIntervalMs =
    config.pollIntervalMs ?? DEFAULT_COMPLETION_POLL_INTERVAL_MS;
  const wait = config.wait ?? sleep;

  while (true) {
    const response = await getOmioVouchersBulkJob(config, fetcher);
    const jobStatus = readOmioVouchersBulkJobStatus(
      response.body,
      'Omio vouchers bulk job status response',
    );

    if (jobStatus === COMPLETED_JOB_STATUS) {
      return response;
    }

    config.onWaiting?.(jobStatus, pollIntervalMs);
    await wait(pollIntervalMs);
  }
}

export async function downloadOmioVouchersBulkJobVouchers(
  config: OmioVouchersBulkJobDownloadConfig,
  fetcher: FetchLike = defaultFetch,
): Promise<OmioVouchersBulkJobDownload> {
  const maxAttempts = config.maxAttempts ?? DEFAULT_DOWNLOAD_MAX_ATTEMPTS;
  const retryDelayMs = config.retryDelayMs ?? DEFAULT_DOWNLOAD_RETRY_DELAY_MS;
  const wait = config.wait ?? sleep;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await downloadOmioVouchersBulkJobVouchersOnce(config, fetcher);
    } catch (error) {
      lastError = toError(error);

      if (attempt >= maxAttempts) {
        break;
      }

      config.onRetry?.(lastError, attempt, maxAttempts, retryDelayMs);
      await wait(retryDelayMs);
    }
  }

  throw new Error(
    `Omio vouchers bulk job vouchers download failed after ${maxAttempts} attempt(s): ${lastError?.message}`,
  );
}

export function readOmioVouchersBulkJobId(body: unknown): string {
  if (isRecord(body) && typeof body.jobId === 'string' && body.jobId) {
    return body.jobId;
  }

  throw new Error('Omio vouchers bulk job response did not include jobId');
}

export function splitOmioVouchersBulkBatchSize(batchSize: number): number[] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('Omio vouchers bulk batch size must be a positive integer');
  }

  const chunks: number[] = [];
  let remainingBatchSize = batchSize;

  while (remainingBatchSize > 0) {
    const chunkSize = Math.min(
      remainingBatchSize,
      MAX_OMIO_VOUCHERS_BULK_BATCH_SIZE,
    );

    chunks.push(chunkSize);
    remainingBatchSize -= chunkSize;
  }

  return chunks;
}

export function buildOmioVouchersBulkJobBodyFromExistingJob(
  sourceJob: unknown,
  batchSize: number,
): OmioVouchersBulkJobBody {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('REPLENISH_BATCH_SIZE must be a positive integer');
  }

  if (batchSize > MAX_OMIO_VOUCHERS_BULK_BATCH_SIZE) {
    throw new Error(
      `Omio vouchers bulk job batchSize must be less than or equal to ${MAX_OMIO_VOUCHERS_BULK_BATCH_SIZE}`,
    );
  }

  if (!isRecord(sourceJob)) {
    throw new Error('Omio vouchers bulk source job response must be an object');
  }

  if (typeof sourceJob.uppercaseIds !== 'boolean') {
    throw new Error(
      'Omio vouchers bulk source job response did not include boolean uppercaseIds',
    );
  }

  if (!isRecord(sourceJob.template)) {
    throw new Error(
      'Omio vouchers bulk source job response did not include template',
    );
  }

  return {
    batchSize,
    uppercaseIds: sourceJob.uppercaseIds,
    template: cloneJsonRecord(sourceJob.template),
  };
}

export function buildOmioVouchersBulkJobVouchersUrl(
  baseUrl: string,
  jobId: string,
): string {
  return new URL(
    `${buildOmioVouchersBulkJobPath(jobId)}/vouchers`,
    ensureTrailingSlash(baseUrl),
  ).toString();
}

export function buildOmioVouchersBulkJobUrl(
  baseUrl: string,
  jobId?: string,
): string {
  const path = jobId
    ? buildOmioVouchersBulkJobPath(jobId)
    : 'private/v3/jobs/vouchers-bulk';

  return new URL(
    path,
    ensureTrailingSlash(baseUrl),
  ).toString();
}

async function downloadOmioVouchersBulkJobVouchersOnce(
  config: OmioVouchersBulkJobDownloadConfig,
  fetcher: FetchLike,
): Promise<OmioVouchersBulkJobDownload> {
  const response = await fetcher(
    buildOmioVouchersBulkJobVouchersUrl(config.baseUrl, config.jobId),
    {
      method: 'GET',
      headers: {
        Accept: '*/*',
        Authorization: `Bearer ${config.accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const responseText = await response.text();
    const statusText = response.statusText ? ` ${response.statusText}` : '';

    throw new Error(
      `Omio vouchers bulk job vouchers download request failed with status ${response.status}${statusText}: ${responseText}`,
    );
  }

  if (!response.arrayBuffer) {
    throw new Error(
      'Omio vouchers bulk job vouchers download response did not include file content',
    );
  }

  const fileContent = Buffer.from(await response.arrayBuffer());

  if (fileContent.byteLength === 0) {
    throw new Error('Omio vouchers bulk job vouchers download was empty');
  }

  await mkdir(dirname(config.outputPath), { recursive: true });
  await writeFile(config.outputPath, fileContent);

  return {
    status: response.status,
    outputPath: config.outputPath,
    byteLength: fileContent.byteLength,
  };
}

function buildOmioVouchersBulkJobPath(jobId: string): string {
  return `private/v3/jobs/vouchers-bulk/${encodeURIComponent(jobId)}`;
}

function readOmioVouchersBulkJobStatus(body: unknown, context: string): string {
  if (isRecord(body) && typeof body.status === 'string' && body.status) {
    return body.status;
  }

  throw new Error(`${context} did not include status`);
}

function parseResponseBody(responseText: string): unknown {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function defaultFetch(
  url: string,
  init: FetchRequestInit,
): Promise<FetchResponseLike> {
  return fetch(url, init);
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
