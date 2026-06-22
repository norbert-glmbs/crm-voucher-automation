import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  buildBrazeAppUsageUrl,
  buildBrazeEnvId,
  buildBrazeNewVoucherUrl,
  buildBrazePromotionCodeListName,
  buildBrazeVouchersUrl,
  buildOmioVouchersBaseUrl,
  loadBrazeLoginConfig,
  loadEnvFileIntoProcessEnv,
  loadMinCodesThreshold,
  loadOmioVoucherApiConfig,
  loadOmioVouchersBulkCreateInputs,
  loadReplenishBatchSize,
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

test('builds the Braze new voucher URL from the selected environment id', () => {
  expect(buildBrazeNewVoucherUrl('production-env')).toBe(
    'https://dashboard-01.braze.com/integrations/vouchers/new/production-env?locale=en',
  );
});

test('builds a Braze Promotion Code list name with a source job id', () => {
  expect(
    buildBrazePromotionCodeListName(
      '20260622_campaign',
      '97e114cb-362c-4261-b331-20d0ed16d98a',
    ),
  ).toBe('20260622_campaign_jobId_97e114cb-362c-4261-b331-20d0ed16d98a');
});

test('maps QA to the Braze QA environment id', () => {
  expect(buildBrazeEnvId('QA')).toBe('592d2af81b0e4d67991edb6b');
});

test('maps production to the Braze production environment id', () => {
  expect(buildBrazeEnvId('PROD')).toBe('577e3b2a56ec312e6058236f');
});

test(
  'loads values from a dotenv file without overriding existing environment values',
  async ({}, testInfo) => {
    const env: NodeJS.ProcessEnv = {
      ENV: 'PROD',
    };
    const envPath = testInfo.outputPath('config.env');

    await writeFile(
      envPath,
      [
        '# local automation config',
        'ENV=QA',
        'LOGIN_USERNAME=operator@example.com',
        'PASSWORD="secret value"',
        'MIN_CODES_THRESHOLD=50 # local threshold',
        'export BRAZE_LOGIN_ALLOW_MANUAL_MFA=true',
      ].join('\n'),
      'utf8',
    );

    loadEnvFileIntoProcessEnv(envPath, env);

    expect(env).toMatchObject({
      ENV: 'PROD',
      LOGIN_USERNAME: 'operator@example.com',
      PASSWORD: 'secret value',
      MIN_CODES_THRESHOLD: '50',
      BRAZE_LOGIN_ALLOW_MANUAL_MFA: 'true',
    });
  },
);

test('loads Braze login config from ENV=QA', () => {
  const config = loadBrazeLoginConfig({
    ENV: 'QA',
    LOGIN_USERNAME: 'operator@example.com',
    PASSWORD: 'secret',
  });

  expect(config).toMatchObject({
    username: 'operator@example.com',
    password: 'secret',
    envId: '592d2af81b0e4d67991edb6b',
    targetUrl:
      'https://dashboard-01.braze.com/dashboard/app_usage/592d2af81b0e4d67991edb6b?locale=en',
    vouchersUrl:
      'https://dashboard-01.braze.com/integrations/vouchers/vouchers/592d2af81b0e4d67991edb6b?locale=en',
    newVoucherUrl:
      'https://dashboard-01.braze.com/integrations/vouchers/new/592d2af81b0e4d67991edb6b?locale=en',
  });
});

test('loads Braze login config from ENV=PROD', () => {
  const config = loadBrazeLoginConfig({
    ENV: 'PROD',
    LOGIN_USERNAME: 'operator@example.com',
    PASSWORD: 'secret',
  });

  expect(config).toMatchObject({
    envId: '577e3b2a56ec312e6058236f',
    targetUrl:
      'https://dashboard-01.braze.com/dashboard/app_usage/577e3b2a56ec312e6058236f?locale=en',
    vouchersUrl:
      'https://dashboard-01.braze.com/integrations/vouchers/vouchers/577e3b2a56ec312e6058236f?locale=en',
  });
});

test('requires an environment selector for Braze login config', () => {
  expect(() =>
    loadBrazeLoginConfig({
      LOGIN_USERNAME: 'operator@example.com',
      PASSWORD: 'secret',
    }),
  ).toThrow('Missing required environment variable: ENV');
});

test('requires ENV to be QA or PROD for Braze login config', () => {
  expect(() =>
    loadBrazeLoginConfig({
      ENV: 'STAGING',
      LOGIN_USERNAME: 'operator@example.com',
      PASSWORD: 'secret',
    }),
  ).toThrow('ENV must be QA or PROD');
});

test('requires a shared username for Braze login config', () => {
  expect(() =>
    loadBrazeLoginConfig({
      ENV: 'QA',
      PASSWORD: 'secret',
    }),
  ).toThrow('Missing required environment variable: LOGIN_USERNAME');
});

test('requires a shared password for Braze login config', () => {
  expect(() =>
    loadBrazeLoginConfig({
      ENV: 'QA',
      LOGIN_USERNAME: 'operator@example.com',
    }),
  ).toThrow('Missing required environment variable: PASSWORD');
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

test('loads the replenish batch size', () => {
  expect(loadReplenishBatchSize({ REPLENISH_BATCH_SIZE: '25' })).toBe(25);
});

test('requires the replenish batch size', () => {
  expect(() => loadReplenishBatchSize({})).toThrow(
    'Missing required environment variable: REPLENISH_BATCH_SIZE',
  );
});

test('requires the replenish batch size to be a positive integer', () => {
  expect(() => loadReplenishBatchSize({ REPLENISH_BATCH_SIZE: '0' })).toThrow(
    'REPLENISH_BATCH_SIZE must be a positive integer',
  );
});

test('loads Omio vouchers bulk create inputs', () => {
  expect(
    loadOmioVouchersBulkCreateInputs({
      JOB_ID: '97e114cb-362c-4261-b331-20d0ed16d98a',
      TARGET_BATCH_SIZE: '25',
      CAMPAIGN_NAME: '20260622_campaign',
    }),
  ).toEqual({
    sourceJobId: '97e114cb-362c-4261-b331-20d0ed16d98a',
    targetBatchSize: 25,
    campaignName: '20260622_campaign',
    promotionCodeListName:
      '20260622_campaign_jobId_97e114cb-362c-4261-b331-20d0ed16d98a',
    codeSnippetName: '20260622_campaign',
  });
});

test('requires Omio vouchers bulk create inputs', () => {
  expect(() =>
    loadOmioVouchersBulkCreateInputs({
      TARGET_BATCH_SIZE: '25',
      CAMPAIGN_NAME: '20260622_campaign',
    }),
  ).toThrow('Missing required environment variable: JOB_ID');
  expect(() =>
    loadOmioVouchersBulkCreateInputs({
      JOB_ID: '97e114cb-362c-4261-b331-20d0ed16d98a',
      CAMPAIGN_NAME: '20260622_campaign',
    }),
  ).toThrow('Missing required environment variable: TARGET_BATCH_SIZE');
  expect(() =>
    loadOmioVouchersBulkCreateInputs({
      JOB_ID: '97e114cb-362c-4261-b331-20d0ed16d98a',
      TARGET_BATCH_SIZE: '25',
    }),
  ).toThrow('Missing required environment variable: CAMPAIGN_NAME');
});

test('requires the target batch size to fit the vouchers bulk API bounds', () => {
  expect(() =>
    loadOmioVouchersBulkCreateInputs({
      JOB_ID: '97e114cb-362c-4261-b331-20d0ed16d98a',
      TARGET_BATCH_SIZE: '0',
      CAMPAIGN_NAME: '20260622_campaign',
    }),
  ).toThrow('TARGET_BATCH_SIZE must be a positive integer');
  expect(() =>
    loadOmioVouchersBulkCreateInputs({
      JOB_ID: '97e114cb-362c-4261-b331-20d0ed16d98a',
      TARGET_BATCH_SIZE: '100001',
      CAMPAIGN_NAME: '20260622_campaign',
    }),
  ).toThrow('TARGET_BATCH_SIZE must be less than or equal to 100000');
});

test('builds the Omio QA vouchers base URL', () => {
  expect(buildOmioVouchersBaseUrl('QA')).toBe('http://localhost:8080/vouchers');
});

test('builds the Omio production vouchers base URL', () => {
  expect(buildOmioVouchersBaseUrl('PROD')).toBe('https://www.omio.com/vouchers');
});

test('loads Omio voucher API config for QA', () => {
  expect(
    loadOmioVoucherApiConfig({
      ENV: 'QA',
      LOGIN_USERNAME: 'client-id',
      PASSWORD: 'client-secret',
    }),
  ).toEqual({
    omioEnv: 'QA',
    baseUrl: 'http://localhost:8080/vouchers',
    username: 'client-id',
    password: 'client-secret',
  });
});

test('loads Omio voucher API config for production', () => {
  expect(
    loadOmioVoucherApiConfig({
      ENV: 'PROD',
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

test('normalizes environment casing', () => {
  expect(
    loadOmioVoucherApiConfig({
      ENV: 'qa',
      LOGIN_USERNAME: 'client-id',
      PASSWORD: 'client-secret',
    }),
  ).toEqual({
    omioEnv: 'QA',
    baseUrl: 'http://localhost:8080/vouchers',
    username: 'client-id',
    password: 'client-secret',
  });
});

test('requires an environment selector for Omio voucher API config', () => {
  expect(() =>
    loadOmioVoucherApiConfig({
      LOGIN_USERNAME: 'client-id',
      PASSWORD: 'client-secret',
    }),
  ).toThrow('Missing required environment variable: ENV');
});

test('requires ENV to be QA or PROD for Omio voucher API config', () => {
  expect(() =>
    loadOmioVoucherApiConfig({
      ENV: 'STAGING',
      LOGIN_USERNAME: 'client-id',
      PASSWORD: 'client-secret',
    }),
  ).toThrow('ENV must be QA or PROD');
});

test('requires a shared username for Omio voucher API config', () => {
  expect(() =>
    loadOmioVoucherApiConfig({
      ENV: 'QA',
      PASSWORD: 'client-secret',
    }),
  ).toThrow('Missing required environment variable: LOGIN_USERNAME');
});

test('requires a shared password for Omio voucher API config', () => {
  expect(() =>
    loadOmioVoucherApiConfig({
      ENV: 'QA',
      LOGIN_USERNAME: 'client-id',
    }),
  ).toThrow('Missing required environment variable: PASSWORD');
});
