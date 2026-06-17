import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

type VoucherType = 'RELATIVE' | 'FIXED';

export const DEFAULT_VOUCHERS_BULK_JOB_BODY_PATH =
  'config/vouchers-bulk-job.json';

const MAX_BATCH_SIZE = 100_000;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const MONEY_TEMPLATE_FIELDS = [
  'flatReduction',
  'minPrice',
  'maxPrice',
  'minPayment',
  'maxReduction',
];
const OPTIONAL_TEMPLATE_ARRAY_FIELDS = [
  'includedCountries',
  'excludedCountries',
  'providers',
  'carriers',
  'allowedBookingDomains',
  'allowedRedemptionPlatforms',
];
const APPROVE_VOUCHERS_BULK_JOB_BODY = {
  approvalStatus: 'APPROVED',
};
const EXPECTED_APPROVAL_JOB_STATUS = 'PENDING';
const COMPLETED_JOB_STATUS = 'COMPLETED';
const DEFAULT_COMPLETION_POLL_INTERVAL_MS = 5_000;
const DEFAULT_DOWNLOAD_MAX_ATTEMPTS = 3;
const DEFAULT_DOWNLOAD_RETRY_DELAY_MS = 5_000;

export async function loadVouchersBulkJobBody(
  filePath = DEFAULT_VOUCHERS_BULK_JOB_BODY_PATH,
): Promise<OmioVouchersBulkJobBody> {
  const rawBody = await readFile(filePath, 'utf8');
  const parsedBody = JSON.parse(rawBody) as unknown;

  return validateVouchersBulkJobBody(parsedBody, filePath);
}

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
  if (isRecord(body)) {
    if (typeof body.jobId === 'string' && body.jobId) {
      return body.jobId;
    }

    if (typeof body.id === 'string' && body.id) {
      return body.id;
    }
  }

  throw new Error('Omio vouchers bulk job response did not include jobId');
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

function validateVouchersBulkJobBody(
  value: unknown,
  filePath: string,
): OmioVouchersBulkJobBody {
  if (!isRecord(value)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }

  const batchSize = value.batchSize;

  if (
    !Number.isInteger(batchSize) ||
    (batchSize as number) < 1 ||
    (batchSize as number) > MAX_BATCH_SIZE
  ) {
    throw new Error(
      `${filePath} batchSize must be an integer from 1 to ${MAX_BATCH_SIZE}.`,
    );
  }

  if (typeof value.uppercaseIds !== 'boolean') {
    throw new Error(`${filePath} must define boolean uppercaseIds.`);
  }

  if (!isRecord(value.template)) {
    throw new Error(`${filePath} must define template as an object.`);
  }

  validateOptionalNonEmptyString(value, 'publisherName', filePath);
  validateOptionalNonEmptyString(value, 'ruleName', filePath);
  validateOptionalRecord(value, 'publisherEmailDetails', filePath);
  validateVoucherTemplate(value.template, batchSize as number, filePath);

  return value as OmioVouchersBulkJobBody;
}

function validateVoucherTemplate(
  template: Record<string, unknown>,
  batchSize: number,
  filePath: string,
): void {
  requireNonEmptyString(template, 'campaignName', `${filePath} template`);
  requireIsoDateTimeString(template, 'expiresAt', `${filePath} template`);
  requireCurrencyCode(template, 'currency', `${filePath} template`);
  validateVoucherId(template, batchSize, filePath);

  for (const fieldName of MONEY_TEMPLATE_FIELDS) {
    validateOptionalPositiveInteger(template, fieldName, `${filePath} template`);
  }

  for (const fieldName of OPTIONAL_TEMPLATE_ARRAY_FIELDS) {
    validateOptionalNonEmptyStringArray(
      template,
      fieldName,
      `${filePath} template`,
    );
  }

  const type = requireVoucherType(template, filePath);

  if (type === 'RELATIVE') {
    requirePositiveInteger(
      template,
      'percentageReduction',
      `${filePath} template`,
    );
    requirePositiveInteger(template, 'maxPrice', `${filePath} template`);
    return;
  }

  const flatReduction = requirePositiveInteger(
    template,
    'flatReduction',
    `${filePath} template`,
  );
  const minPrice = requirePositiveInteger(
    template,
    'minPrice',
    `${filePath} template`,
  );

  if (flatReduction > minPrice) {
    throw new Error(
      `${filePath} template.flatReduction must be less than or equal to template.minPrice.`,
    );
  }
}

function validateVoucherId(
  template: Record<string, unknown>,
  batchSize: number,
  filePath: string,
): void {
  if (!hasField(template, 'voucherId')) {
    return;
  }

  requireNonEmptyString(template, 'voucherId', `${filePath} template`);

  if (batchSize !== 1) {
    throw new Error(
      `${filePath} template.voucherId can only be set when batchSize is 1.`,
    );
  }
}

function requireVoucherType(
  template: Record<string, unknown>,
  filePath: string,
): VoucherType {
  const value = template.type;

  if (value !== 'RELATIVE' && value !== 'FIXED') {
    throw new Error(`${filePath} template.type must be RELATIVE or FIXED.`);
  }

  return value;
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  fieldName: string,
  context: string,
): string {
  const value = record[fieldName];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context}.${fieldName} must be a non-empty string.`);
  }

  return value;
}

function validateOptionalNonEmptyString(
  record: Record<string, unknown>,
  fieldName: string,
  context: string,
): void {
  if (!hasField(record, fieldName)) {
    return;
  }

  requireNonEmptyString(record, fieldName, context);
}

function validateOptionalRecord(
  record: Record<string, unknown>,
  fieldName: string,
  context: string,
): void {
  if (!hasField(record, fieldName)) {
    return;
  }

  if (!isRecord(record[fieldName])) {
    throw new Error(`${context}.${fieldName} must be an object.`);
  }
}

function requireIsoDateTimeString(
  record: Record<string, unknown>,
  fieldName: string,
  context: string,
): void {
  const value = requireNonEmptyString(record, fieldName, context);

  if (
    !ISO_DATE_TIME_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(`${context}.${fieldName} must be an ISO date-time string.`);
  }
}

function requireCurrencyCode(
  record: Record<string, unknown>,
  fieldName: string,
  context: string,
): void {
  const value = requireNonEmptyString(record, fieldName, context);

  if (!/^[A-Z]{3}$/.test(value)) {
    throw new Error(`${context}.${fieldName} must be an ISO currency code.`);
  }
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  fieldName: string,
  context: string,
): number {
  const value = record[fieldName];

  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${context}.${fieldName} must be a positive integer.`);
  }

  return value as number;
}

function validateOptionalPositiveInteger(
  record: Record<string, unknown>,
  fieldName: string,
  context: string,
): void {
  if (!hasField(record, fieldName)) {
    return;
  }

  requirePositiveInteger(record, fieldName, context);
}

function validateOptionalNonEmptyStringArray(
  record: Record<string, unknown>,
  fieldName: string,
  context: string,
): void {
  if (!hasField(record, fieldName)) {
    return;
  }

  const value = record[fieldName];

  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
    throw new Error(`${context}.${fieldName} must be an array of strings.`);
  }

  if (value.length === 0) {
    throw new Error(
      `${context}.${fieldName} must not be empty; omit it when unused.`,
    );
  }
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

function hasField(record: Record<string, unknown>, fieldName: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, fieldName);
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
