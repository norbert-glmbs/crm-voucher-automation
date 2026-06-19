import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  approveOmioVouchersBulkJob,
  buildOmioVouchersBulkJobBodyFromExistingJob,
  buildOmioVouchersBulkJobVouchersUrl,
  buildOmioVouchersBulkJobUrl,
  createOmioVouchersBulkJob,
  downloadOmioVouchersBulkJobVouchers,
  getOmioVouchersBulkJob,
  readOmioVouchersBulkJobId,
  waitForOmioVouchersBulkJobCompletion,
} from '../../src/api/omioVouchersBulk';

const RELATIVE_VOUCHERS_BULK_BODY = {
  batchSize: 1,
  uppercaseIds: false,
  template: {
    campaignName: '20260617_cs_all_promotional_1_eur_relative_unique__',
    currency: 'EUR',
    type: 'RELATIVE',
    expiresAt: '2026-06-24T08:43:31.935Z',
    maximumRedemption: 1,
    percentageReduction: 1,
    maxPrice: 100,
    allowedRedemptionPlatforms: ['ALL'],
    visibility: 'PRIVATE',
    category: 'GENERIC',
    allowedBookingDomains: ['TRAVEL'],
  },
};

const FIXED_VOUCHERS_BULK_BODY = {
  batchSize: 10,
  uppercaseIds: false,
  publisherName: 'crm-voucher-automation',
  ruleName: 'fixed-voucher-bulk',
  publisherEmailDetails: {
    replyTo: 'support@example.com',
  },
  template: {
    campaignName: '20260617_cs_all_promotional_15_eur_fixed_bulk',
    currency: 'EUR',
    type: 'FIXED',
    expiresAt: '2026-06-17T20:00:00Z',
    maximumRedemption: 1,
    flatReduction: 1500,
    minPrice: 2000,
    allowedRedemptionPlatforms: ['ALL'],
    visibility: 'PRIVATE',
    category: 'GENERIC',
    allowedBookingDomains: ['TRAVEL'],
  },
};

function textArrayBuffer(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(Buffer.from(value));

  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

test('builds the Omio vouchers bulk job URL', () => {
  expect(buildOmioVouchersBulkJobUrl('https://www.omio.com/vouchers')).toBe(
    'https://www.omio.com/vouchers/private/v3/jobs/vouchers-bulk',
  );
});

test('builds the Omio vouchers bulk job URL with a job id', () => {
  expect(
    buildOmioVouchersBulkJobUrl(
      'https://www.omio.com/vouchers',
      'bulk/job 123',
    ),
  ).toBe(
    'https://www.omio.com/vouchers/private/v3/jobs/vouchers-bulk/bulk%2Fjob%20123',
  );
});

test('builds the Omio vouchers bulk job vouchers download URL', () => {
  expect(
    buildOmioVouchersBulkJobVouchersUrl(
      'https://www.omio.com/vouchers',
      'bulk/job 123',
    ),
  ).toBe(
    'https://www.omio.com/vouchers/private/v3/jobs/vouchers-bulk/bulk%2Fjob%20123/vouchers',
  );
});

test('builds a vouchers bulk job body from an existing source job', () => {
  expect(
    buildOmioVouchersBulkJobBodyFromExistingJob(
      {
        batchSize: 100,
        uppercaseIds: true,
        status: 'COMPLETED',
        template: {
          ...FIXED_VOUCHERS_BULK_BODY.template,
          voucherId: 'TEMPLATE',
          includedCountries: [],
        },
      },
      25,
    ),
  ).toEqual({
    batchSize: 25,
    uppercaseIds: true,
    template: {
      ...FIXED_VOUCHERS_BULK_BODY.template,
      voucherId: 'TEMPLATE',
      includedCountries: [],
    },
  });
});

test('fails clearly when the source job batch size override is invalid', () => {
  expect(() =>
    buildOmioVouchersBulkJobBodyFromExistingJob(
      {
        uppercaseIds: false,
        template: RELATIVE_VOUCHERS_BULK_BODY.template,
      },
      0,
    ),
  ).toThrow('REPLENISH_BATCH_SIZE must be a positive integer');
});

test('fails clearly when the source job response is invalid', () => {
  expect(() => buildOmioVouchersBulkJobBodyFromExistingJob(null, 10)).toThrow(
    'Omio vouchers bulk source job response must be an object',
  );
  expect(() =>
    buildOmioVouchersBulkJobBodyFromExistingJob(
      {
        template: RELATIVE_VOUCHERS_BULK_BODY.template,
      },
      10,
    ),
  ).toThrow(
    'Omio vouchers bulk source job response did not include boolean uppercaseIds',
  );
  expect(() =>
    buildOmioVouchersBulkJobBodyFromExistingJob(
      {
        uppercaseIds: false,
      },
      10,
    ),
  ).toThrow('Omio vouchers bulk source job response did not include template');
});

test('reads vouchers bulk job id from creation response', () => {
  expect(readOmioVouchersBulkJobId({ jobId: 'job-id-123' })).toBe('job-id-123');
});

test('fails clearly when creation response has no job id', () => {
  expect(() => readOmioVouchersBulkJobId({ status: 'CREATED' })).toThrow(
    'Omio vouchers bulk job response did not include jobId',
  );
});

test('creates an Omio vouchers bulk job with bearer token and JSON body', async () => {
  const calls: Array<{
    url: string;
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    };
  }> = [];

  const response = await createOmioVouchersBulkJob(
    {
      baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
      accessToken: 'access-token-123',
      body: RELATIVE_VOUCHERS_BULK_BODY,
    },
    async (url, init) => {
      calls.push({ url, init });

      return {
        ok: true,
        status: 202,
        text: async () =>
          JSON.stringify({
            jobId: 'bulk-job-123',
          }),
      };
    },
  );

  expect(response).toEqual({
    status: 202,
    body: {
      jobId: 'bulk-job-123',
    },
  });
  expect(calls).toEqual([
    {
      url: 'https://www.omio.com.qa.goeuro.ninja/vouchers/private/v3/jobs/vouchers-bulk',
      init: {
        method: 'POST',
        headers: {
          Accept: '*/*',
          Authorization: 'Bearer access-token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(RELATIVE_VOUCHERS_BULK_BODY),
      },
    },
  ]);
});

test('approves an Omio vouchers bulk job with bearer token and approval body', async () => {
  const calls: Array<{
    url: string;
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    };
  }> = [];

  const response = await approveOmioVouchersBulkJob(
    {
      baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
      accessToken: 'access-token-123',
      jobId: 'bulk-job-123',
    },
    async (url, init) => {
      calls.push({ url, init });

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jobId: 'bulk-job-123',
            status: 'PENDING',
          }),
      };
    },
  );

  expect(response).toEqual({
    status: 200,
    body: {
      jobId: 'bulk-job-123',
      status: 'PENDING',
    },
  });
  expect(calls).toEqual([
    {
      url: 'https://www.omio.com.qa.goeuro.ninja/vouchers/private/v3/jobs/vouchers-bulk/bulk-job-123',
      init: {
        method: 'PATCH',
        headers: {
          Accept: '*/*',
          Authorization: 'Bearer access-token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approvalStatus: 'APPROVED',
        }),
      },
    },
  ]);
});

test('fails clearly when Omio vouchers bulk job approval request is rejected', async () => {
  await expect(
    approveOmioVouchersBulkJob(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        accessToken: 'access-token-123',
        jobId: 'bulk-job-123',
      },
      async () => ({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        text: async () => 'approval failed',
      }),
    ),
  ).rejects.toThrow(
    'Omio vouchers bulk job approval request failed with status 409 Conflict: approval failed',
  );
});

test('fails clearly when approved Omio vouchers bulk job is not pending', async () => {
  await expect(
    approveOmioVouchersBulkJob(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        accessToken: 'access-token-123',
        jobId: 'bulk-job-123',
      },
      async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jobId: 'bulk-job-123',
            status: 'APPROVED',
          }),
      }),
    ),
  ).rejects.toThrow(
    'Omio vouchers bulk job approval returned job status APPROVED; expected PENDING.',
  );
});

test('fails clearly when Omio vouchers bulk job approval response has no status', async () => {
  await expect(
    approveOmioVouchersBulkJob(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        accessToken: 'access-token-123',
        jobId: 'bulk-job-123',
      },
      async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jobId: 'bulk-job-123',
          }),
      }),
    ),
  ).rejects.toThrow(
    'Omio vouchers bulk job approval response did not include status',
  );
});

test('gets an Omio vouchers bulk job with bearer token', async () => {
  const calls: Array<{
    url: string;
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    };
  }> = [];

  const response = await getOmioVouchersBulkJob(
    {
      baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
      accessToken: 'access-token-123',
      jobId: 'bulk-job-123',
    },
    async (url, init) => {
      calls.push({ url, init });

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jobId: 'bulk-job-123',
            status: 'COMPLETED',
          }),
      };
    },
  );

  expect(response).toEqual({
    status: 200,
    body: {
      jobId: 'bulk-job-123',
      status: 'COMPLETED',
    },
  });
  expect(calls).toEqual([
    {
      url: 'https://www.omio.com.qa.goeuro.ninja/vouchers/private/v3/jobs/vouchers-bulk/bulk-job-123',
      init: {
        method: 'GET',
        headers: {
          Accept: '*/*',
          Authorization: 'Bearer access-token-123',
        },
      },
    },
  ]);
});

test('polls Omio vouchers bulk job status until completed', async () => {
  const calls: Array<{
    url: string;
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    };
  }> = [];
  const waitedMs: number[] = [];
  const waitingLogs: Array<{
    jobStatus: string;
    pollIntervalMs: number;
  }> = [];
  const statuses = ['PENDING', 'PROCESSING', 'COMPLETED'];

  const response = await waitForOmioVouchersBulkJobCompletion(
    {
      baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
      accessToken: 'access-token-123',
      jobId: 'bulk-job-123',
      pollIntervalMs: 25,
      wait: async (durationMs) => {
        waitedMs.push(durationMs);
      },
      onWaiting: (jobStatus, pollIntervalMs) => {
        waitingLogs.push({ jobStatus, pollIntervalMs });
      },
    },
    async (url, init) => {
      calls.push({ url, init });
      const jobStatus = statuses[calls.length - 1];

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jobId: 'bulk-job-123',
            status: jobStatus,
          }),
      };
    },
  );

  expect(response).toEqual({
    status: 200,
    body: {
      jobId: 'bulk-job-123',
      status: 'COMPLETED',
    },
  });
  expect(calls).toHaveLength(3);
  expect(calls.map(({ init }) => init.method)).toEqual(['GET', 'GET', 'GET']);
  expect(waitedMs).toEqual([25, 25]);
  expect(waitingLogs).toEqual([
    { jobStatus: 'PENDING', pollIntervalMs: 25 },
    { jobStatus: 'PROCESSING', pollIntervalMs: 25 },
  ]);
});

test('fails clearly when Omio vouchers bulk job status request is rejected', async () => {
  await expect(
    getOmioVouchersBulkJob(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        accessToken: 'access-token-123',
        jobId: 'bulk-job-123',
      },
      async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'unavailable',
      }),
    ),
  ).rejects.toThrow(
    'Omio vouchers bulk job status request failed with status 500 Internal Server Error: unavailable',
  );
});

test('fails clearly when polled Omio vouchers bulk job has no status', async () => {
  await expect(
    waitForOmioVouchersBulkJobCompletion(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        accessToken: 'access-token-123',
        jobId: 'bulk-job-123',
        wait: async () => undefined,
      },
      async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jobId: 'bulk-job-123',
          }),
      }),
    ),
  ).rejects.toThrow(
    'Omio vouchers bulk job status response did not include status',
  );
});

test('downloads Omio vouchers bulk job vouchers to a file', async ({}, testInfo) => {
  const calls: Array<{
    url: string;
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    };
  }> = [];
  const outputPath = testInfo.outputPath('vouchers.csv');

  const download = await downloadOmioVouchersBulkJobVouchers(
    {
      baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
      accessToken: 'access-token-123',
      jobId: 'bulk-job-123',
      outputPath,
    },
    async (url, init) => {
      calls.push({ url, init });

      return {
        ok: true,
        status: 200,
        text: async () => '',
        arrayBuffer: async () => textArrayBuffer('voucher_id\nABC123\n'),
      };
    },
  );

  await expect(readFile(outputPath, 'utf8')).resolves.toBe(
    'voucher_id\nABC123\n',
  );
  expect(download).toEqual({
    status: 200,
    outputPath,
    byteLength: 18,
  });
  expect(calls).toEqual([
    {
      url: 'https://www.omio.com.qa.goeuro.ninja/vouchers/private/v3/jobs/vouchers-bulk/bulk-job-123/vouchers',
      init: {
        method: 'GET',
        headers: {
          Accept: '*/*',
          Authorization: 'Bearer access-token-123',
        },
      },
    },
  ]);
});

test('retries Omio vouchers bulk job vouchers download before succeeding', async ({}, testInfo) => {
  const waitedMs: number[] = [];
  const retryLogs: Array<{
    message: string;
    attempt: number;
    maxAttempts: number;
    retryDelayMs: number;
  }> = [];
  const outputPath = testInfo.outputPath('retried-vouchers.csv');
  let calls = 0;

  const download = await downloadOmioVouchersBulkJobVouchers(
    {
      baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
      accessToken: 'access-token-123',
      jobId: 'bulk-job-123',
      outputPath,
      maxAttempts: 3,
      retryDelayMs: 25,
      wait: async (durationMs) => {
        waitedMs.push(durationMs);
      },
      onRetry: (error, attempt, maxAttempts, retryDelayMs) => {
        retryLogs.push({
          message: error.message,
          attempt,
          maxAttempts,
          retryDelayMs,
        });
      },
    },
    async () => {
      calls += 1;

      if (calls === 1) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => 'file not ready',
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () => '',
        arrayBuffer: async () => textArrayBuffer('voucher_id\nABC123\n'),
      };
    },
  );

  expect(download).toEqual({
    status: 200,
    outputPath,
    byteLength: 18,
  });
  expect(calls).toBe(2);
  expect(waitedMs).toEqual([25]);
  expect(retryLogs).toEqual([
    {
      message:
        'Omio vouchers bulk job vouchers download request failed with status 404 Not Found: file not ready',
      attempt: 1,
      maxAttempts: 3,
      retryDelayMs: 25,
    },
  ]);
});

test('fails clearly after Omio vouchers bulk job vouchers download retries are exhausted', async ({}, testInfo) => {
  const outputPath = testInfo.outputPath('failed-vouchers.csv');
  let calls = 0;

  await expect(
    downloadOmioVouchersBulkJobVouchers(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        accessToken: 'access-token-123',
        jobId: 'bulk-job-123',
        outputPath,
        maxAttempts: 2,
        retryDelayMs: 1,
        wait: async () => undefined,
      },
      async () => {
        calls += 1;

        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'unavailable',
        };
      },
    ),
  ).rejects.toThrow(
    'Omio vouchers bulk job vouchers download failed after 2 attempt(s): Omio vouchers bulk job vouchers download request failed with status 500 Internal Server Error: unavailable',
  );
  expect(calls).toBe(2);
});

test('fails clearly when Omio vouchers bulk job vouchers download has no file content', async ({}, testInfo) => {
  await expect(
    downloadOmioVouchersBulkJobVouchers(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        accessToken: 'access-token-123',
        jobId: 'bulk-job-123',
        outputPath: testInfo.outputPath('missing-content.csv'),
        maxAttempts: 1,
      },
      async () => ({
        ok: true,
        status: 200,
        text: async () => '',
      }),
    ),
  ).rejects.toThrow(
    'Omio vouchers bulk job vouchers download response did not include file content',
  );
});

test('fails clearly when Omio vouchers bulk job request is rejected', async () => {
  await expect(
    createOmioVouchersBulkJob(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        accessToken: 'access-token-123',
        body: RELATIVE_VOUCHERS_BULK_BODY,
      },
      async () => ({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'invalid voucher template',
      }),
    ),
  ).rejects.toThrow(
    'Omio vouchers bulk job request failed with status 400 Bad Request: invalid voucher template',
  );
});
