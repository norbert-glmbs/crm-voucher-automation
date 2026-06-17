import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  approveOmioVouchersBulkJob,
  buildOmioVouchersBulkJobUrl,
  createOmioVouchersBulkJob,
  getOmioVouchersBulkJob,
  loadVouchersBulkJobBody,
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

test('loads relative vouchers bulk job body from JSON file', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('vouchers-bulk-job.json');
  await writeFile(
    bodyPath,
    JSON.stringify(RELATIVE_VOUCHERS_BULK_BODY),
    'utf8',
  );

  await expect(loadVouchersBulkJobBody(bodyPath)).resolves.toEqual(
    RELATIVE_VOUCHERS_BULK_BODY,
  );
});

test('loads fixed vouchers bulk job body and preserves optional job fields', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('fixed-vouchers-bulk-job.json');
  await writeFile(bodyPath, JSON.stringify(FIXED_VOUCHERS_BULK_BODY), 'utf8');

  await expect(loadVouchersBulkJobBody(bodyPath)).resolves.toEqual(
    FIXED_VOUCHERS_BULK_BODY,
  );
});

test('fails clearly when vouchers bulk job body is invalid', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('invalid-vouchers-bulk-job.json');
  await writeFile(bodyPath, JSON.stringify({ batchSize: 1 }), 'utf8');

  await expect(loadVouchersBulkJobBody(bodyPath)).rejects.toThrow(
    `${bodyPath} must define boolean uppercaseIds.`,
  );
});

test('fails clearly when batch size is outside backend bounds', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('invalid-batch-size.json');
  await writeFile(
    bodyPath,
    JSON.stringify({
      ...RELATIVE_VOUCHERS_BULK_BODY,
      batchSize: 100001,
    }),
    'utf8',
  );

  await expect(loadVouchersBulkJobBody(bodyPath)).rejects.toThrow(
    `${bodyPath} batchSize must be an integer from 1 to 100000.`,
  );
});

test('fails clearly when required common template fields are missing', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('missing-campaign-name.json');
  await writeFile(
    bodyPath,
    JSON.stringify({
      ...RELATIVE_VOUCHERS_BULK_BODY,
      template: {
        ...RELATIVE_VOUCHERS_BULK_BODY.template,
        campaignName: '',
      },
    }),
    'utf8',
  );

  await expect(loadVouchersBulkJobBody(bodyPath)).rejects.toThrow(
    `${bodyPath} template.campaignName must be a non-empty string.`,
  );
});

test('fails clearly when a relative voucher is missing max price', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('relative-missing-max-price.json');
  const { maxPrice, ...template } = RELATIVE_VOUCHERS_BULK_BODY.template;
  await writeFile(
    bodyPath,
    JSON.stringify({
      ...RELATIVE_VOUCHERS_BULK_BODY,
      template,
    }),
    'utf8',
  );

  await expect(loadVouchersBulkJobBody(bodyPath)).rejects.toThrow(
    `${bodyPath} template.maxPrice must be a positive integer.`,
  );
});

test('fails clearly when a fixed voucher reduction exceeds min price', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('fixed-invalid-reduction.json');
  await writeFile(
    bodyPath,
    JSON.stringify({
      ...FIXED_VOUCHERS_BULK_BODY,
      template: {
        ...FIXED_VOUCHERS_BULK_BODY.template,
        flatReduction: 2500,
      },
    }),
    'utf8',
  );

  await expect(loadVouchersBulkJobBody(bodyPath)).rejects.toThrow(
    `${bodyPath} template.flatReduction must be less than or equal to template.minPrice.`,
  );
});

test('fails clearly when optional template arrays are empty', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('empty-optional-arrays.json');
  await writeFile(
    bodyPath,
    JSON.stringify({
      ...RELATIVE_VOUCHERS_BULK_BODY,
      template: {
        ...RELATIVE_VOUCHERS_BULK_BODY.template,
        includedCountries: [],
      },
    }),
    'utf8',
  );

  await expect(loadVouchersBulkJobBody(bodyPath)).rejects.toThrow(
    `${bodyPath} template.includedCountries must not be empty; omit it when unused.`,
  );
});

test('fails clearly when a custom voucher id is used with a bulk batch', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('bulk-custom-voucher-id.json');
  await writeFile(
    bodyPath,
    JSON.stringify({
      ...FIXED_VOUCHERS_BULK_BODY,
      template: {
        ...FIXED_VOUCHERS_BULK_BODY.template,
        voucherId: 'CUSTOMCODE',
      },
    }),
    'utf8',
  );

  await expect(loadVouchersBulkJobBody(bodyPath)).rejects.toThrow(
    `${bodyPath} template.voucherId can only be set when batchSize is 1.`,
  );
});

test('reads vouchers bulk job id from creation response', () => {
  expect(readOmioVouchersBulkJobId({ jobId: 'job-id-123' })).toBe('job-id-123');
  expect(readOmioVouchersBulkJobId({ id: 'legacy-id-123' })).toBe(
    'legacy-id-123',
  );
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
            id: 'bulk-job-123',
          }),
      };
    },
  );

  expect(response).toEqual({
    status: 202,
    body: {
      id: 'bulk-job-123',
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
            id: 'bulk-job-123',
            status: 'PENDING',
          }),
      };
    },
  );

  expect(response).toEqual({
    status: 200,
    body: {
      id: 'bulk-job-123',
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
            id: 'bulk-job-123',
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
            id: 'bulk-job-123',
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
            id: 'bulk-job-123',
            status: 'COMPLETED',
          }),
      };
    },
  );

  expect(response).toEqual({
    status: 200,
    body: {
      id: 'bulk-job-123',
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
            id: 'bulk-job-123',
            status: jobStatus,
          }),
      };
    },
  );

  expect(response).toEqual({
    status: 200,
    body: {
      id: 'bulk-job-123',
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
            id: 'bulk-job-123',
          }),
      }),
    ),
  ).rejects.toThrow(
    'Omio vouchers bulk job status response did not include status',
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
