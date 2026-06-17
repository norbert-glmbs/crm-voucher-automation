import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  buildOmioVouchersBulkJobUrl,
  createOmioVouchersBulkJob,
  loadVouchersBulkJobBody,
} from '../../src/api/omioVouchersBulk';

const VOUCHERS_BULK_BODY = {
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
    includedCountries: [],
    excludedCountries: [],
    providers: [],
    carriers: [],
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

test('loads vouchers bulk job body from JSON file', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('vouchers-bulk-job.json');
  await writeFile(bodyPath, JSON.stringify(VOUCHERS_BULK_BODY), 'utf8');

  await expect(loadVouchersBulkJobBody(bodyPath)).resolves.toEqual(
    VOUCHERS_BULK_BODY,
  );
});

test('fails clearly when vouchers bulk job body is invalid', async ({}, testInfo) => {
  const bodyPath = testInfo.outputPath('invalid-vouchers-bulk-job.json');
  await writeFile(bodyPath, JSON.stringify({ batchSize: 1 }), 'utf8');

  await expect(loadVouchersBulkJobBody(bodyPath)).rejects.toThrow(
    `${bodyPath} must define boolean uppercaseIds.`,
  );
});

test('creates an Omio vouchers bulk job with bearer token and JSON body', async () => {
  const calls: Array<{
    url: string;
    init: {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
  }> = [];

  const response = await createOmioVouchersBulkJob(
    {
      baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
      accessToken: 'access-token-123',
      body: VOUCHERS_BULK_BODY,
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
        body: JSON.stringify(VOUCHERS_BULK_BODY),
      },
    },
  ]);
});

test('fails clearly when Omio vouchers bulk job request is rejected', async () => {
  await expect(
    createOmioVouchersBulkJob(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        accessToken: 'access-token-123',
        body: VOUCHERS_BULK_BODY,
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
