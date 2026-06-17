import { expect, test } from '@playwright/test';
import {
  buildBrazeAppUsageUrl,
  buildBrazeVouchersUrl,
  loadBrazeLoginConfig,
  loadMinCodesThreshold,
} from '../../src/config';

test('builds the Braze app usage URL from the selected environment id', () => {
  expect(buildBrazeAppUsageUrl('production-env')).toBe(
    'https://dashboard-01.braze.com/dashboard/app_usage/production-env?locale=en',
  );
});

test('builds the Braze vouchers URL from the selected environment id', () => {
  expect(buildBrazeVouchersUrl('production-env')).toBe(
    'https://dashboard-01.braze.com/integrations/vouchers/vouchers/production-env?locale=en',
  );
});

test('loads Braze login config with an environment-specific target URL', () => {
  const config = loadBrazeLoginConfig({
    BRAZE_USERNAME: 'operator@example.com',
    BRAZE_PASSWORD: 'secret',
    BRAZE_ENV_ID: 'staging-env',
  });

  expect(config).toMatchObject({
    username: 'operator@example.com',
    password: 'secret',
    envId: 'staging-env',
    targetUrl:
      'https://dashboard-01.braze.com/dashboard/app_usage/staging-env?locale=en',
    vouchersUrl:
      'https://dashboard-01.braze.com/integrations/vouchers/vouchers/staging-env?locale=en',
  });
});

test('requires a Braze environment id', () => {
  expect(() =>
    loadBrazeLoginConfig({
      BRAZE_USERNAME: 'operator@example.com',
      BRAZE_PASSWORD: 'secret',
    }),
  ).toThrow('Missing required environment variable: BRAZE_ENV_ID');
});

test('loads the minimum codes threshold', () => {
  expect(loadMinCodesThreshold({ MIN_CODES_THRESHOLD: '50' })).toBe(50);
});

test('requires a minimum codes threshold', () => {
  expect(() => loadMinCodesThreshold({})).toThrow(
    'Missing required environment variable: MIN_CODES_THRESHOLD',
  );
});

test('requires the minimum codes threshold to be a positive integer', () => {
  expect(() => loadMinCodesThreshold({ MIN_CODES_THRESHOLD: '0' })).toThrow(
    'MIN_CODES_THRESHOLD must be a positive integer',
  );
});
