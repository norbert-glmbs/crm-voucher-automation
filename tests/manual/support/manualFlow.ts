import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

const FULL_FLOW_ENV_VARS = ['RUN_BRAZE_FLOW'];

export function shouldRunManualSpec(specificEnvVar: string): boolean {
  return (
    isEnabled(process.env[specificEnvVar]) ||
    FULL_FLOW_ENV_VARS.some((envVar) => isEnabled(process.env[envVar]))
  );
}

export function manualSkipMessage(specificEnvVar: string, action: string): string {
  return `Set ${specificEnvVar}=true to ${action}, or RUN_BRAZE_FLOW=true to run the full flow.`;
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
