import { readFileSync } from 'node:fs';

export type BrazeLoginConfig = {
  targetUrl: string;
  vouchersUrl: string;
  newVoucherUrl: string;
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

export type OmioVouchersBulkCreateInputs = {
  sourceJobId: string;
  targetBatchSize: number;
  campaignName: string;
  promotionCodeListName: string;
  codeSnippetName: string;
};

export type OmioVouchersBulkSelectedReplenishment = {
  campaignName: string;
  batchSize: number;
};

const DEFAULT_BRAZE_DASHBOARD_ORIGIN = 'https://dashboard-01.braze.com';
const DEFAULT_AUTH_STATE_PATH = '.playwright/.auth/braze.json';
const DEFAULT_MFA_TIMEOUT_MS = 120_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
const MAX_REPLENISH_BATCH_SIZE = 1_000_000;
const BRAZE_ENV_IDS: Record<OmioEnv, string> = {
  QA: '592d2af81b0e4d67991edb6b',
  PROD: '577e3b2a56ec312e6058236f',
};
const OMIO_VOUCHER_BASE_URLS: Record<OmioEnv, string> = {
  QA: 'https://www.omio.com.qa.goeuro.ninja/vouchers',
  PROD: 'https://www.omio.com/vouchers',
};

loadEnvFileIntoProcessEnv();

export function loadEnvFileIntoProcessEnv(
  filePath = '.env',
  env: NodeJS.ProcessEnv = process.env,
): void {
  let rawEnvFile: string;

  try {
    rawEnvFile = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  const rawLines = rawEnvFile.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
    const rawLine = rawLines[lineIndex];
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const envLine = line.startsWith('export ') ? line.slice(7).trimStart() : line;
    const equalsIndex = envLine.indexOf('=');

    if (equalsIndex <= 0) {
      continue;
    }

    const key = envLine.slice(0, equalsIndex).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || env[key] !== undefined) {
      continue;
    }

    let rawValue = envLine.slice(equalsIndex + 1);

    while (hasUnclosedQuotedValue(rawValue) && lineIndex + 1 < rawLines.length) {
      lineIndex += 1;
      rawValue += `\n${rawLines[lineIndex]}`;
    }

    env[key] = parseEnvFileValue(rawValue);
  }
}

export function loadBrazeLoginConfig(
  env: NodeJS.ProcessEnv = process.env,
): BrazeLoginConfig {
  const selectedEnv = loadEnvironment(env);
  const { username, password } = loadSharedCredentials(env);
  const envId = buildBrazeEnvId(selectedEnv);

  return {
    targetUrl: buildBrazeAppUsageUrl(
      envId,
      env.BRAZE_DASHBOARD_ORIGIN || DEFAULT_BRAZE_DASHBOARD_ORIGIN,
    ),
    vouchersUrl: buildBrazeVouchersUrl(
      envId,
      env.BRAZE_DASHBOARD_ORIGIN || DEFAULT_BRAZE_DASHBOARD_ORIGIN,
    ),
    newVoucherUrl: buildBrazeNewVoucherUrl(
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

export function loadReplenishBatchSize(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const batchSize = parsePositiveInteger(
    requireEnv(env, 'REPLENISH_BATCH_SIZE'),
    0,
    'REPLENISH_BATCH_SIZE',
  );

  return Math.min(batchSize, MAX_REPLENISH_BATCH_SIZE);
}

export function loadOmioVouchersBulkSelectedReplenishments(
  env: NodeJS.ProcessEnv = process.env,
): OmioVouchersBulkSelectedReplenishment[] {
  return parseSelectedReplenishmentsJson(
    requireNonEmptyEnv(env, 'SELECTED_REPLENISHMENT_CAMPAIGNS'),
  );
}

function parseSelectedReplenishmentsJson(
  value: string,
): OmioVouchersBulkSelectedReplenishment[] {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(value);
  } catch {
    throw new Error(
      'SELECTED_REPLENISHMENT_CAMPAIGNS must be a JSON array of { campaignName, batchSize } objects',
    );
  }

  if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
    throw new Error(
      'SELECTED_REPLENISHMENT_CAMPAIGNS must be a non-empty JSON array',
    );
  }

  const selectedReplenishments = parsedValue.map((entry, index) => {
    const entryLabel = `SELECTED_REPLENISHMENT_CAMPAIGNS[${index}]`;

    if (!isRecord(entry)) {
      throw new Error(`${entryLabel} must be an object`);
    }

    return createSelectedReplenishment(
      entry.campaignName,
      entry.batchSize,
      entryLabel,
    );
  });

  validateUniqueSelectedReplenishmentCampaignNames(selectedReplenishments);

  return selectedReplenishments;
}

function createSelectedReplenishment(
  campaignNameValue: unknown,
  batchSizeValue: unknown,
  entryLabel: string,
): OmioVouchersBulkSelectedReplenishment {
  if (typeof campaignNameValue !== 'string' || !campaignNameValue.trim()) {
    throw new Error(`${entryLabel}.campaignName must be a non-empty string`);
  }

  const batchSize =
    typeof batchSizeValue === 'number'
      ? batchSizeValue
      : Number(batchSizeValue);

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error(`${entryLabel}.batchSize must be a positive integer`);
  }

  return {
    campaignName: campaignNameValue.trim(),
    batchSize: Math.min(batchSize, MAX_REPLENISH_BATCH_SIZE),
  };
}

function validateUniqueSelectedReplenishmentCampaignNames(
  selectedReplenishments: OmioVouchersBulkSelectedReplenishment[],
): void {
  const campaignNames = new Set<string>();

  for (const selectedReplenishment of selectedReplenishments) {
    if (campaignNames.has(selectedReplenishment.campaignName)) {
      throw new Error(
        `Selected replenishment campaign name is duplicated: ${selectedReplenishment.campaignName}`,
      );
    }

    campaignNames.add(selectedReplenishment.campaignName);
  }
}

export function loadOmioVouchersBulkCreateInputs(
  env: NodeJS.ProcessEnv = process.env,
): OmioVouchersBulkCreateInputs {
  const sourceJobId = requireNonEmptyEnv(env, 'JOB_ID');
  const campaignName = requireNonEmptyEnv(env, 'CAMPAIGN_NAME');
  const targetBatchSize = parsePositiveInteger(
    requireEnv(env, 'TARGET_BATCH_SIZE'),
    0,
    'TARGET_BATCH_SIZE',
  );

  return {
    sourceJobId,
    targetBatchSize,
    campaignName,
    promotionCodeListName: buildBrazePromotionCodeListName(
      campaignName,
      sourceJobId,
    ),
    codeSnippetName: campaignName,
  };
}

export function loadOmioVoucherApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): OmioVoucherApiConfig {
  const omioEnv = loadEnvironment(env);
  const { username, password } = loadSharedCredentials(env);

  return {
    omioEnv,
    baseUrl: buildOmioVouchersBaseUrl(omioEnv),
    username,
    password,
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

export function buildBrazeNewVoucherUrl(
  envId: string,
  dashboardOrigin = DEFAULT_BRAZE_DASHBOARD_ORIGIN,
): string {
  const url = new URL(
    `/integrations/vouchers/new/${encodeURIComponent(envId)}`,
    dashboardOrigin,
  );
  url.searchParams.set('locale', 'en');

  return url.toString();
}

export function buildBrazePromotionCodeListName(
  campaignName: string,
  jobId: string,
): string {
  return `${campaignName}_jobId_${jobId}`;
}

export function buildOmioVouchersBaseUrl(omioEnv: OmioEnv): string {
  return OMIO_VOUCHER_BASE_URLS[omioEnv];
}

export function buildBrazeEnvId(env: OmioEnv): string {
  return BRAZE_ENV_IDS[env];
}

function loadEnvironment(env: NodeJS.ProcessEnv): OmioEnv {
  return parseEnvironment(requireEnv(env, 'ENV'));
}

function loadSharedCredentials(env: NodeJS.ProcessEnv): {
  username: string;
  password: string;
} {
  return {
    username: loadSharedUsername(env),
    password: requireEnv(env, 'PASSWORD'),
  };
}

function loadSharedUsername(env: NodeJS.ProcessEnv): string {
  if (env.LOGIN_USERNAME) {
    return env.LOGIN_USERNAME;
  }

  throw new Error('Missing required environment variable: LOGIN_USERNAME');
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function requireNonEmptyEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = requireEnv(env, key).trim();

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

function parseEnvironment(value: string): OmioEnv {
  const normalizedValue = value.toUpperCase();

  if (normalizedValue === 'QA' || normalizedValue === 'PROD') {
    return normalizedValue;
  }

  throw new Error('ENV must be QA or PROD');
}

function parseEnvFileValue(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
    return trimmedValue
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  if (trimmedValue.startsWith("'") && trimmedValue.endsWith("'")) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue.replace(/\s+#.*$/, '');
}

function hasUnclosedQuotedValue(value: string): boolean {
  const trimmedValue = value.trim();
  const quote = trimmedValue[0];

  return (quote === '"' || quote === "'") && !trimmedValue.endsWith(quote);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
