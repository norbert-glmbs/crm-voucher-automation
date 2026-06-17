import { readFile } from 'node:fs/promises';

export type OmioVouchersBulkJobBody = {
  batchSize: number;
  uppercaseIds: boolean;
  template: Record<string, unknown>;
};

export type OmioVouchersBulkJobConfig = {
  baseUrl: string;
  accessToken: string;
  body: OmioVouchersBulkJobBody;
};

export type OmioVouchersBulkJobResponse = {
  status: number;
  body: unknown;
};

type FetchRequestInit = {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText?: string;
  text: () => Promise<string>;
};

type FetchLike = (
  url: string,
  init: FetchRequestInit,
) => Promise<FetchResponseLike>;

export const DEFAULT_VOUCHERS_BULK_JOB_BODY_PATH =
  'config/vouchers-bulk-job.json';

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

export function buildOmioVouchersBulkJobUrl(baseUrl: string): string {
  return new URL(
    'private/v3/jobs/vouchers-bulk',
    ensureTrailingSlash(baseUrl),
  ).toString();
}

function validateVouchersBulkJobBody(
  value: unknown,
  filePath: string,
): OmioVouchersBulkJobBody {
  if (!isRecord(value)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }

  if (typeof value.batchSize !== 'number') {
    throw new Error(`${filePath} must define numeric batchSize.`);
  }

  if (typeof value.uppercaseIds !== 'boolean') {
    throw new Error(`${filePath} must define boolean uppercaseIds.`);
  }

  if (!isRecord(value.template)) {
    throw new Error(`${filePath} must define template as an object.`);
  }

  return {
    batchSize: value.batchSize,
    uppercaseIds: value.uppercaseIds,
    template: value.template,
  };
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

async function defaultFetch(
  url: string,
  init: FetchRequestInit,
): Promise<FetchResponseLike> {
  return fetch(url, init);
}
