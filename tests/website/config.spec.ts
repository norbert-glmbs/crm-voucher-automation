import { expect, test } from '@playwright/test';
import {
  buildBrazeAppUsageUrl,
  buildBrazeVouchersUrl,
  buildOmioVouchersBaseUrl,
  loadBrazeLoginConfig,
  loadMinCodesThreshold,
  loadOmioVoucherApiConfig,
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

test('builds the Omio QA vouchers base URL', () => {
  expect(buildOmioVouchersBaseUrl('QA')).toBe(
    'https://www.omio.com.qa.goeuro.ninja/vouchers',
  );
});

test('builds the Omio production vouchers base URL', () => {
  expect(buildOmioVouchersBaseUrl('PROD')).toBe('https://www.omio.com/vouchers');
});

test('loads Omio voucher API config for QA', () => {
  expect(
    loadOmioVoucherApiConfig({
      OMIO_ENV: 'QA',
      OMIO_USER: 'client-id',
      OMIO_PASS: 'client-secret',
    }),
  ).toEqual({
    omioEnv: 'QA',
    baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
    username: 'client-id',
    password: 'client-secret',
  });
});

test('loads Omio voucher API config for production', () => {
  expect(
    loadOmioVoucherApiConfig({
      OMIO_ENV: 'PROD',
      OMIO_USER: 'client-id',
      OMIO_PASS: 'client-secret',
    }),
  ).toEqual({
    omioEnv: 'PROD',
    baseUrl: 'https://www.omio.com/vouchers',
    username: 'client-id',
    password: 'client-secret',
  });
});

test('normalizes Omio environment casing', () => {
  expect(
    loadOmioVoucherApiConfig({
      OMIO_ENV: 'qa',
      OMIO_USER: 'client-id',
      OMIO_PASS: 'client-secret',
    }),
  ).toEqual({
    omioEnv: 'QA',
    baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
    username: 'client-id',
    password: 'client-secret',
  });
});

test('requires an Omio environment', () => {
  expect(() => loadOmioVoucherApiConfig({})).toThrow(
    'Missing required environment variable: OMIO_ENV',
  );
});

test('requires Omio environment to be QA or PROD', () => {
  expect(() =>
    loadOmioVoucherApiConfig({
      OMIO_ENV: 'STAGING',
      OMIO_USER: 'client-id',
      OMIO_PASS: 'client-secret',
    }),
  ).toThrow('OMIO_ENV must be QA or PROD');
});

test('requires an Omio username', () => {
  expect(() =>
    loadOmioVoucherApiConfig({
      OMIO_ENV: 'QA',
      OMIO_PASS: 'client-secret',
    }),
  ).toThrow('Missing required environment variable: OMIO_USER');
});

test('requires an Omio password', () => {
  expect(() =>
    loadOmioVoucherApiConfig({
      OMIO_ENV: 'QA',
      OMIO_USER: 'client-id',
    }),
  ).toThrow('Missing required environment variable: OMIO_PASS');
});
