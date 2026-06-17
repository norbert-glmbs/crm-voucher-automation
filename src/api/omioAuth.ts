import { Buffer } from 'node:buffer';

export type OmioAuthConfig = {
  baseUrl: string;
  username: string;
  password: string;
};

export type OmioAccessToken = {
  accessToken: string;
};

type FetchRequestInit = {
  method: 'POST';
  headers: Record<string, string>;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type FetchLike = (
  url: string,
  init: FetchRequestInit,
) => Promise<FetchResponseLike>;

export async function requestOmioAccessToken(
  config: OmioAuthConfig,
  fetcher: FetchLike = defaultFetch,
): Promise<OmioAccessToken> {
  var tokenUrl = buildOmioTokenUrl(config.baseUrl);
  var user = config.username;
  var password = config.password;
  console.log(tokenUrl, user, password);
  const response = await fetcher(buildOmioTokenUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: buildBasicAuthHeader(config.username, config.password),
    },
  });

  if (!response.ok) {
    const responseText = await response.text();
    const statusText = response.statusText ? ` ${response.statusText}` : '';

    throw new Error(
      `Omio token request failed with status ${response.status}${statusText}: ${responseText}`,
    );
  }

  const body = await response.json();
  const accessToken = readAccessToken(body);

  return { accessToken };
}

export function buildOmioTokenUrl(baseUrl: string): string {
  const url = new URL('oauth/token', ensureTrailingSlash(baseUrl));
  url.searchParams.set('grant_type', 'client_credentials');

  return url.toString();
}

export function buildBasicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function readAccessToken(body: unknown): string {
  if (
    !isRecord(body) ||
    typeof body.access_token !== 'string' ||
    !body.access_token
  ) {
    throw new Error('Omio token response did not include access_token');
  }

  return body.access_token;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function defaultFetch(
  url: string,
  init: FetchRequestInit,
): Promise<FetchResponseLike> {
  return fetch(url, init);
}
