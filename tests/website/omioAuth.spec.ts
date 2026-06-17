import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import {
  buildBasicAuthHeader,
  buildOmioTokenUrl,
  requestOmioAccessToken,
} from '../../src/api/omioAuth';

test('builds the Omio token URL from the vouchers base URL', () => {
  expect(buildOmioTokenUrl('https://www.omio.com/vouchers')).toBe(
    'https://www.omio.com/vouchers/oauth/token?grant_type=client_credentials',
  );
});

test('builds a basic auth header from Omio credentials', () => {
  expect(buildBasicAuthHeader('client-id', 'client-secret')).toBe(
    `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
  );
});

test('requests an Omio access token with client credentials', async () => {
  const calls: Array<{
    url: string;
    init: {
      method: string;
      headers: Record<string, string>;
    };
  }> = [];

  const token = await requestOmioAccessToken(
    {
      baseUrl: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
      username: 'client-id',
      password: 'client-secret',
    },
    async (url, init) => {
      calls.push({ url, init });

      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'token-123',
        }),
        text: async () => '',
      };
    },
  );

  expect(token).toEqual({ accessToken: 'token-123' });
  expect(calls).toEqual([
    {
      url: 'https://www.omio.com.qa.goeuro.ninja/vouchers/oauth/token?grant_type=client_credentials',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from('client-id:client-secret').toString(
            'base64',
          )}`,
        },
      },
    },
  ]);
});

test('fails clearly when the Omio token request is rejected', async () => {
  await expect(
    requestOmioAccessToken(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        username: 'client-id',
        password: 'client-secret',
      },
      async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({}),
        text: async () => 'invalid credentials',
      }),
    ),
  ).rejects.toThrow(
    'Omio token request failed with status 401 Unauthorized: invalid credentials',
  );
});

test('fails clearly when the Omio token response has no access token', async () => {
  await expect(
    requestOmioAccessToken(
      {
        baseUrl: 'https://www.omio.com/vouchers',
        username: 'client-id',
        password: 'client-secret',
      },
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
      }),
    ),
  ).rejects.toThrow('Omio token response did not include access_token');
});
