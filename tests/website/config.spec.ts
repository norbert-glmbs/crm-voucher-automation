import { expect, test } from '@playwright/test';
import { buildBrazeAppUsageUrl, loadBrazeLoginConfig } from '../../src/config';

test('builds the Braze app usage URL from the selected environment id', () => {
  expect(buildBrazeAppUsageUrl('production-env')).toBe(
    'https://dashboard-01.braze.com/dashboard/app_usage/production-env?locale=en',
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
