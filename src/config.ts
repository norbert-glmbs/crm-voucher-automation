export type BrazeLoginConfig = {
  targetUrl: string;
  vouchersUrl: string;
  envId: string;
  username: string;
  password: string;
  authStatePath: string;
  allowManualMfa: boolean;
  mfaTimeoutMs: number;
  navigationTimeoutMs: number;
};

export type OmioEnv = 'QA' | 'PROD';

export type OmioVoucherApiConfig = {
  omioEnv: OmioEnv;
  baseUrl: string;
  username: string;
  password: string;
};

const DEFAULT_BRAZE_DASHBOARD_ORIGIN = 'https://dashboard-01.braze.com';
const DEFAULT_AUTH_STATE_PATH = '.playwright/.auth/braze.json';
const DEFAULT_MFA_TIMEOUT_MS = 120_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
const OMIO_VOUCHER_BASE_URLS: Record<OmioEnv, string> = {
  QA: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
  PROD: 'https://www.omio.com/vouchers',
};

export function loadBrazeLoginConfig(
  env: NodeJS.ProcessEnv = process.env,
): BrazeLoginConfig {
  const username = requireEnv(env, 'BRAZE_USERNAME');
  const password = requireEnv(env, 'BRAZE_PASSWORD');
  const envId = requireEnv(env, 'BRAZE_ENV_ID');

  return {
    targetUrl: buildBrazeAppUsageUrl(
      envId,
      env.BRAZE_DASHBOARD_ORIGIN || DEFAULT_BRAZE_DASHBOARD_ORIGIN,
    ),
    vouchersUrl: buildBrazeVouchersUrl(
      envId,
      env.BRAZE_DASHBOARD_ORIGIN || DEFAULT_BRAZE_DASHBOARD_ORIGIN,
    ),
    envId,
    username,
    password,
    authStatePath: env.BRAZE_AUTH_STATE_PATH || DEFAULT_AUTH_STATE_PATH,
    allowManualMfa: parseBoolean(env.BRAZE_LOGIN_ALLOW_MANUAL_MFA, false),
    mfaTimeoutMs: parsePositiveInteger(
      env.BRAZE_LOGIN_MFA_TIMEOUT_MS,
      DEFAULT_MFA_TIMEOUT_MS,
      'BRAZE_LOGIN_MFA_TIMEOUT_MS',
    ),
    navigationTimeoutMs: parsePositiveInteger(
      env.BRAZE_LOGIN_NAVIGATION_TIMEOUT_MS,
      DEFAULT_NAVIGATION_TIMEOUT_MS,
      'BRAZE_LOGIN_NAVIGATION_TIMEOUT_MS',
    ),
  };
}

export function loadMinCodesThreshold(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInteger(
    requireEnv(env, 'MIN_CODES_THRESHOLD'),
    0,
    'MIN_CODES_THRESHOLD',
  );
}

export function loadOmioVoucherApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): OmioVoucherApiConfig {
  const omioEnv = parseOmioEnv(requireEnv(env, 'OMIO_ENV'));

  return {
    omioEnv,
    baseUrl: buildOmioVouchersBaseUrl(omioEnv),
    username: requireEnv(env, 'OMIO_USER'),
    password: requireEnv(env, 'OMIO_PASS'),
  };
}

export function buildBrazeAppUsageUrl(
  envId: string,
  dashboardOrigin = DEFAULT_BRAZE_DASHBOARD_ORIGIN,
): string {
  const url = new URL(
    `/dashboard/app_usage/${encodeURIComponent(envId)}`,
    dashboardOrigin,
  );
  url.searchParams.set('locale', 'en');

  return url.toString();
}

export function buildBrazeVouchersUrl(
  envId: string,
  dashboardOrigin = DEFAULT_BRAZE_DASHBOARD_ORIGIN,
): string {
  const url = new URL(
    `/integrations/vouchers/vouchers/${encodeURIComponent(envId)}`,
    dashboardOrigin,
  );
  url.searchParams.set('locale', 'en');

  return url.toString();
}

export function buildOmioVouchersBaseUrl(omioEnv: OmioEnv): string {
  return OMIO_VOUCHER_BASE_URLS[omioEnv];
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  if (['1', 'true', 'yes', 'y'].includes(value.toLowerCase())) {
    return true;
  }

  if (['0', 'false', 'no', 'n'].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parsePositiveInteger(
  value: string | undefined,
  defaultValue: number,
  envKey: string,
): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envKey} must be a positive integer`);
  }

  return parsed;
}

function parseOmioEnv(value: string): OmioEnv {
  const normalizedValue = value.toUpperCase();

  if (normalizedValue === 'QA' || normalizedValue === 'PROD') {
    return normalizedValue;
  }

  throw new Error('OMIO_ENV must be QA or PROD');
}
