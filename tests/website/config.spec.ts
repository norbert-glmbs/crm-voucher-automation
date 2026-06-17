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
    LOGIN_USERNAME: 'operator@example.com',
    PASSWORD: 'secret',
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
      LOGIN_USERNAME: 'operator@example.com',
      PASSWORD: 'secret',
    }),
  ).toThrow('Missing required environment variable: BRAZE_ENV_ID');
});

test('requires a shared username for Braze login config', () => {
  expect(() =>
    loadBrazeLoginConfig({
      PASSWORD: 'secret',
      BRAZE_ENV_ID: 'staging-env',
    }),
  ).toThrow('Missing required environment variable: LOGIN_USERNAME');
});

test('requires a shared password for Braze login config', () => {
  expect(() =>
    loadBrazeLoginConfig({
      LOGIN_USERNAME: 'operator@example.com',
      BRAZE_ENV_ID: 'staging-env',
    }),
  ).toThrow('Missing required environment variable: PASSWORD');
});

test('accepts USERNAME as a fallback when it is explicitly supplied', () => {
  const config = loadBrazeLoginConfig({
    USERNAME: 'operator@example.com',
    USER: 'local-user',
    LOGNAME: 'local-user',
    PASSWORD: 'secret',
    BRAZE_ENV_ID: 'staging-env',
  });

  expect(config.username).toBe('operator@example.com');
});

test('rejects USERNAME when it resolves to the local shell user', () => {
  expect(() =>
    loadBrazeLoginConfig({
      USERNAME: 'local-user',
      USER: 'local-user',
      LOGNAME: 'local-user',
      PASSWORD: 'secret',
      BRAZE_ENV_ID: 'staging-env',
    }),
  ).toThrow(
    'USERNAME resolved to the local shell user. Set LOGIN_USERNAME for the shared Braze/Omio login username.',
  );
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
      LOGIN_USERNAME: 'client-id',
      PASSWORD: 'client-secret',
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
      LOGIN_USERNAME: 'client-id',
      PASSWORD: 'client-secret',
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
      LOGIN_USERNAME: 'client-id',
      PASSWORD: 'client-secret',
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
      LOGIN_USERNAME: 'client-id',
      PASSWORD: 'client-secret',
    }),
  ).toThrow('OMIO_ENV must be QA or PROD');
});

test('requires a shared username for Omio voucher API config', () => {
  expect(() =>
    loadOmioVoucherApiConfig({
      OMIO_ENV: 'QA',
      PASSWORD: 'client-secret',
    }),
  ).toThrow('Missing required environment variable: LOGIN_USERNAME');
});

test('requires a shared password for Omio voucher API config', () => {
  expect(() =>
    loadOmioVoucherApiConfig({
      OMIO_ENV: 'QA',
      LOGIN_USERNAME: 'client-id',
    }),
  ).toThrow('Missing required environment variable: PASSWORD');
});
