import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

const BRAZE_FLOW_ENV_VAR = 'RUN_BRAZE_FLOW';

export function shouldRunBrazeManualSpec(specificEnvVar: string): boolean {
  return (
    isEnabled(process.env[specificEnvVar]) ||
    isEnabled(process.env[BRAZE_FLOW_ENV_VAR])
  );
}

export function brazeManualSkipMessage(
  specificEnvVar: string,
  action: string,
): string {
  return `Set ${specificEnvVar}=true to ${action}, or ${BRAZE_FLOW_ENV_VAR}=true to run the full Braze flow.`;
}

export async function getReadableFilePath(
  filePath: string,
): Promise<string | undefined> {
  try {
    await access(filePath, constants.R_OK);
    return filePath;
  } catch {
    return undefined;
  }
}

function isEnabled(value: string | undefined): boolean {
  return value !== undefined && ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
}
