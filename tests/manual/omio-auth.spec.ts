import { expect, test } from '@playwright/test';
import { requestOmioAccessToken } from '../../src/api/omioAuth';
import { loadOmioVoucherApiConfig } from '../../src/config';
import { manualSkipMessage, shouldRunManualSpec } from './support/manualFlow';

test.skip(
  !shouldRunManualSpec('RUN_OMIO_AUTH'),
  manualSkipMessage('RUN_OMIO_AUTH', 'request an Omio access token'),
);

test('requests an Omio access token and prints access_token', async () => {
  const config = loadOmioVoucherApiConfig();
  const token = await requestOmioAccessToken(config);

  console.log(token.accessToken);

  expect(token.accessToken).not.toBe('');
});
