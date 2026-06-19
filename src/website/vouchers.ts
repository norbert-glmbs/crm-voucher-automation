import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { Locator, Page } from '@playwright/test';

export type ActiveVoucherRow = {
  displayName: string;
  remaining: string;
  total: string;
};

type VoucherTableRow = ActiveVoucherRow & {
  status: string;
};

type HeaderIndexes = {
  displayName: number;
  remaining: number;
  total: number;
  status: number;
};

type VoucherTableModel = {
  headers: string[];
  rows: string[][];
};

type PrintActiveVoucherRowsOptions = {
  vouchersUrl: string;
  navigationTimeoutMs?: number;
  tableTimeoutMs?: number;
  log?: (message: string) => void;
};

type PrintVoucherRowsBelowThresholdOptions = PrintActiveVoucherRowsOptions & {
  minCodesThreshold: number;
};

type UploadVoucherCsvOptions = PrintVoucherRowsBelowThresholdOptions & {
  filePath: string;
  targetDisplayName?: string;
};

export type UploadVoucherCsvResult = ActiveVoucherRow & {
  filePath: string;
  uploadedFilePath: string;
};

const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
const DEFAULT_TABLE_TIMEOUT_MS = 30_000;
const REQUIRED_HEADERS = ['display name', 'remaining', 'total', 'status'];
const FILE_CHOOSER_TIMEOUT_MS = 1_000;
const OMIO_VOUCHERS_BULK_JOB_ID_PATTERN =
  /(?:^|_)jobId_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:_|$)/;

export async function printActiveVoucherRowsBelowThresholdFromBraze(
  page: Page,
  options: PrintVoucherRowsBelowThresholdOptions,
): Promise<ActiveVoucherRow[]> {
  await goToBrazeVouchersPage(page, options.vouchersUrl, options.navigationTimeoutMs);

  const activeRows = await readActiveVoucherRows(page, options.tableTimeoutMs);
  const rowsBelowThreshold = filterActiveVoucherRowsBelowThreshold(
    activeRows,
    options.minCodesThreshold,
  );

  printActiveVoucherRowsBelowThreshold(
    rowsBelowThreshold,
    options.minCodesThreshold,
    options.log,
  );

  return rowsBelowThreshold;
}

export async function uploadCsvToActiveVoucherRowBelowThresholdFromBraze(
  page: Page,
  options: UploadVoucherCsvOptions,
): Promise<UploadVoucherCsvResult> {
  await goToBrazeVouchersPage(page, options.vouchersUrl, options.navigationTimeoutMs);

  const activeRows = await readActiveVoucherRows(page, options.tableTimeoutMs);
  const rowsBelowThreshold = filterActiveVoucherRowsBelowThreshold(
    activeRows,
    options.minCodesThreshold,
  );

  printActiveVoucherRowsBelowThreshold(
    rowsBelowThreshold,
    options.minCodesThreshold,
    options.log,
  );

  const rowToUpdate = options.targetDisplayName
    ? rowsBelowThreshold.find((row) => row.displayName === options.targetDisplayName)
    : rowsBelowThreshold[0];

  if (!rowToUpdate) {
    if (options.targetDisplayName) {
      throw new Error(
        `ACTIVE Promotion Code "${options.targetDisplayName}" was not below MIN_CODES_THRESHOLD[${options.minCodesThreshold}] and cannot be selected for CSV upload.`,
      );
    }

    throw new Error(
      `No ACTIVE Promotion Codes below MIN_CODES_THRESHOLD[${options.minCodesThreshold}] were available for CSV upload.`,
    );
  }

  options.log?.(`Opening Braze Promotion Code list ${rowToUpdate.displayName}`);
  await openVoucherTableRowByDisplayName(
    page,
    rowToUpdate.displayName,
    options.tableTimeoutMs ?? DEFAULT_TABLE_TIMEOUT_MS,
  );

  const uploadedFilePath = await prepareCsvForBrazeUpload(options.filePath);

  options.log?.(`Uploading CSV ${uploadedFilePath}`);
  await uploadCsvToOpenVoucherList(page, uploadedFilePath);

  options.log?.(`Uploaded CSV to Braze Promotion Code list ${rowToUpdate.displayName}`);

  return {
    ...rowToUpdate,
    filePath: options.filePath,
    uploadedFilePath,
  };
}

export async function goToBrazeVouchersPage(
  page: Page,
  vouchersUrl: string,
  navigationTimeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS,
): Promise<void> {
  page.setDefaultTimeout(navigationTimeoutMs);
  page.setDefaultNavigationTimeout(navigationTimeoutMs);

  await page.goto(vouchersUrl, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForLoadState('networkidle', {
      timeout: Math.min(navigationTimeoutMs, 5_000),
    });
  } catch {
    // Braze pages may keep background requests open; the table wait below is decisive.
  }
}

export async function readActiveVoucherRows(
  page: Page,
  tableTimeoutMs = DEFAULT_TABLE_TIMEOUT_MS,
): Promise<ActiveVoucherRow[]> {
  const table = await readVoucherTableModel(page, tableTimeoutMs);
  const headerIndexes = getHeaderIndexes(table.headers);

  return table.rows
    .map((cells) => readVoucherTableRow(cells, headerIndexes))
    .filter((row): row is VoucherTableRow => row !== null)
    .filter((row) => normalizeStatus(row.status) === 'active')
    .map(({ displayName, remaining, total }) => ({
      displayName,
      remaining,
      total,
    }));
}

export function filterActiveVoucherRowsBelowThreshold(
  rows: ActiveVoucherRow[],
  minCodesThreshold: number,
): ActiveVoucherRow[] {
  return rows.filter(
    (row) =>
      parseVoucherCount(row.remaining, `${row.displayName} remaining`) <
      minCodesThreshold,
  );
}

export function printActiveVoucherRowsBelowThreshold(
  rows: ActiveVoucherRow[],
  minCodesThreshold: number,
  log: (message: string) => void = console.log,
): void {
  if (rows.length === 0) {
    log(`No ACTIVE Promotion Codes below MIN_CODES_THRESHOLD[${minCodesThreshold}]`);
    return;
  }

  log(`ACTIVE Promotion Codes below MIN_CODES_THRESHOLD[${minCodesThreshold}]`);

  for (const row of rows) {
    log(formatActiveVoucherRow(row));
  }
}

export function formatActiveVoucherRow(row: ActiveVoucherRow): string {
  return [
    `Display Name[${row.displayName}]`,
    `Remaining Vouchers[${row.remaining}]`,
    `Total Vouchers[${row.total}]`,
  ].join(' | ');
}

export function parseVoucherCount(value: string, fieldName = 'voucher count'): number {
  const normalizedValue = value.replace(/[,\s]/g, '');

  if (!/^\d+$/.test(normalizedValue)) {
    throw new Error(`Unable to parse ${fieldName}: ${value}`);
  }

  return Number(normalizedValue);
}

export function extractOmioVouchersBulkJobIdFromDisplayName(
  displayName: string,
): string {
  const match = displayName.match(OMIO_VOUCHERS_BULK_JOB_ID_PATTERN);

  if (!match) {
    throw new Error(
      `Unable to extract Omio vouchers bulk jobId from Braze Promotion Code display name: ${displayName}`,
    );
  }

  return match[1];
}

async function readVoucherTableModel(
  page: Page,
  timeoutMs: number,
): Promise<VoucherTableModel> {
  const deadline = Date.now() + timeoutMs;
  const tableCandidates = page.locator('table, [role="table"], [role="grid"]');
  const seenHeaderSets = new Set<string>();

  while (Date.now() <= deadline) {
    const candidateCount = await tableCandidates.count();

    for (let index = 0; index < candidateCount; index += 1) {
      const candidate = tableCandidates.nth(index);

      if (!(await isVisible(candidate))) {
        continue;
      }

      const table = await parseTable(candidate);
      const normalizedHeaders = table.headers.map(normalizeHeaderText);

      if (normalizedHeaders.length > 0) {
        seenHeaderSets.add(table.headers.join(', '));
      }

      if (hasRequiredHeaders(normalizedHeaders)) {
        return table;
      }
    }

    await page.waitForTimeout(250);
  }

  const foundHeaders =
    seenHeaderSets.size > 0 ? [...seenHeaderSets].join(' | ') : 'no table headers found';

  throw new Error(
    `Braze voucher table with headers ${REQUIRED_HEADERS.join(
      ', ',
    )} was not visible within ${timeoutMs}ms. Found: ${foundHeaders}.`,
  );
}

async function openVoucherTableRowByDisplayName(
  page: Page,
  displayName: string,
  timeoutMs: number,
): Promise<void> {
  const row = await findVoucherTableRowByDisplayName(page, displayName, timeoutMs);
  const escapedDisplayName = escapeRegExp(displayName);
  const preferredClickTargets = [
    row.getByRole('link', { name: new RegExp(escapedDisplayName, 'i') }),
    row.getByRole('button', { name: new RegExp(escapedDisplayName, 'i') }),
  ];

  for (const target of preferredClickTargets) {
    if (await hasVisibleLocator(target)) {
      await clickAndWaitForPossibleNavigation(page, target.first());
      return;
    }
  }

  await clickAndWaitForPossibleNavigation(page, row);
}

async function findVoucherTableRowByDisplayName(
  page: Page,
  displayName: string,
  timeoutMs: number,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  const tableCandidates = page.locator('table, [role="table"], [role="grid"]');

  while (Date.now() <= deadline) {
    const candidateCount = await tableCandidates.count();

    for (let index = 0; index < candidateCount; index += 1) {
      const candidate = tableCandidates.nth(index);

      if (!(await isVisible(candidate))) {
        continue;
      }

      const table = await parseTable(candidate);
      let headerIndexes: HeaderIndexes;

      try {
        headerIndexes = getHeaderIndexes(table.headers);
      } catch {
        continue;
      }

      const { rows, cellSelector } = await getVoucherTableRowLocators(candidate);

      for (const row of rows) {
        const cells = await normalizedTextContents(row.locator(cellSelector));
        const parsedRow = readVoucherTableRow(cells, headerIndexes);

        if (parsedRow?.displayName === displayName) {
          return row;
        }
      }
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Braze voucher table row "${displayName}" was not visible.`);
}

async function getVoucherTableRowLocators(
  table: Locator,
): Promise<{
  rows: Locator[];
  cellSelector: string;
}> {
  if ((await table.locator('tr').count()) > 0) {
    const bodyRows = await table.locator('tbody tr').all();

    if (bodyRows.length > 0) {
      return {
        rows: bodyRows,
        cellSelector: 'th, td',
      };
    }

    return {
      rows: (await table.locator('tr').all()).slice(1),
      cellSelector: 'th, td',
    };
  }

  return {
    rows: await table.locator('[role="row"]').all(),
    cellSelector: '[role="cell"], [role="gridcell"]',
  };
}

async function uploadCsvToOpenVoucherList(page: Page, filePath: string): Promise<void> {
  const uploadTrigger = await findVisibleLocator([
    page.getByRole('button', { name: /upload csv/i }),
    page.getByRole('link', { name: /upload csv/i }),
    page.getByText(/upload csv/i),
  ]);
  const existingFileInput = page.locator('input[type="file"]').first();

  if (uploadTrigger) {
    const fileChooserPromise = page
      .waitForEvent('filechooser', { timeout: FILE_CHOOSER_TIMEOUT_MS })
      .catch(() => null);

    await uploadTrigger.click();

    const fileChooser = await fileChooserPromise;

    if (fileChooser) {
      await fileChooser.setFiles(filePath);
    } else {
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
    }
  } else if (await hasAttachedLocator(existingFileInput)) {
    await existingFileInput.setInputFiles(filePath);
  } else {
    throw new Error('Braze Upload CSV control was not visible.');
  }

  const startUploadButton = await waitForVisibleLocator(page, [
    page.getByRole('button', { name: /start upload/i }),
    page.getByText(/start upload/i),
  ]);

  if (!startUploadButton) {
    throw new Error('Braze Start Upload button was not visible.');
  }

  await clickAndWaitForPossibleNavigation(page, startUploadButton);

  const updateButton = await waitForVisibleLocator(page, [
    page.getByRole('button', { name: /update list/i }),
    page.getByText(/update list/i),
  ]);

  if (!updateButton) {
    throw new Error('Braze Update list button was not visible.');
  }

  await clickAndWaitForPossibleNavigation(page, updateButton);
}

async function prepareCsvForBrazeUpload(filePath: string): Promise<string> {
  const rawCsv = await readFile(filePath, 'utf8');
  const csvWithoutHeader = removeVoucherCodeHeaderRow(rawCsv);
  const uploadFilePath = buildBrazeUploadCsvPath(filePath);

  await writeFile(uploadFilePath, csvWithoutHeader, 'utf8');

  return uploadFilePath;
}

function removeVoucherCodeHeaderRow(value: string): string {
  const lineEndingMatch = value.match(/\r\n|\n|\r/);

  if (!lineEndingMatch || lineEndingMatch.index === undefined) {
    return normalizeCsvHeaderCell(value) === 'voucher_code' ? '' : value;
  }

  const firstLineEndIndex = lineEndingMatch.index;
  const firstLine = value.slice(0, firstLineEndIndex);

  if (normalizeCsvHeaderCell(firstCsvCell(firstLine)) !== 'voucher_code') {
    return value;
  }

  return value.slice(firstLineEndIndex + lineEndingMatch[0].length);
}

function firstCsvCell(line: string): string {
  const trimmedLine = line.replace(/^\uFEFF/, '');

  if (!trimmedLine.startsWith('"')) {
    return trimmedLine.split(',')[0] ?? '';
  }

  let cell = '';

  for (let index = 1; index < trimmedLine.length; index += 1) {
    const char = trimmedLine[index];
    const nextChar = trimmedLine[index + 1];

    if (char === '"' && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      return cell;
    }

    cell += char;
  }

  return cell;
}

function normalizeCsvHeaderCell(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase();
}

function buildBrazeUploadCsvPath(filePath: string): string {
  const extension = extname(filePath);

  if (extension.toLowerCase() === '.csv') {
    return `${filePath.slice(0, -extension.length)}.braze-upload${extension}`;
  }

  return `${filePath}.braze-upload.csv`;
}

async function parseTable(table: Locator): Promise<VoucherTableModel> {
  if ((await table.locator('tr').count()) > 0) {
    return parseNativeTable(table);
  }

  return parseRoleTable(table);
}

async function parseNativeTable(table: Locator): Promise<VoucherTableModel> {
  const headers = await firstNonEmptyTextList([
    table.locator('thead tr').first().locator('th, td'),
    table.locator('tr').first().locator('th, td'),
  ]);

  const bodyRows = await textRows(table.locator('tbody tr'), 'th, td');

  if (bodyRows.length > 0) {
    return { headers, rows: bodyRows };
  }

  const allRows = await textRows(table.locator('tr'), 'th, td');

  return {
    headers,
    rows: allRows.slice(1),
  };
}

async function parseRoleTable(table: Locator): Promise<VoucherTableModel> {
  const headers = await normalizedTextContents(table.locator('[role="columnheader"]'));
  const rows = await textRows(table.locator('[role="row"]'), [
    '[role="cell"]',
    '[role="gridcell"]',
  ]);

  return { headers, rows };
}

async function firstNonEmptyTextList(locators: Locator[]): Promise<string[]> {
  for (const locator of locators) {
    const texts = await normalizedTextContents(locator);

    if (texts.length > 0) {
      return texts;
    }
  }

  return [];
}

async function textRows(
  rowLocator: Locator,
  cellSelector: string | string[],
): Promise<string[][]> {
  const rows = await rowLocator.all();
  const selector = Array.isArray(cellSelector) ? cellSelector.join(', ') : cellSelector;
  const parsedRows: string[][] = [];

  for (const row of rows) {
    const cells = await normalizedTextContents(row.locator(selector));

    if (cells.length > 0) {
      parsedRows.push(cells);
    }
  }

  return parsedRows;
}

async function normalizedTextContents(locator: Locator): Promise<string[]> {
  return (await locator.allTextContents())
    .map(normalizeCellText)
    .filter((text) => text.length > 0);
}

function getHeaderIndexes(headers: string[]): HeaderIndexes {
  const normalizedHeaders = headers.map(normalizeHeaderText);

  return {
    displayName: findHeaderIndex(normalizedHeaders, 'display name', headers),
    remaining: findHeaderIndex(normalizedHeaders, 'remaining', headers),
    total: findHeaderIndex(normalizedHeaders, 'total', headers),
    status: findHeaderIndex(normalizedHeaders, 'status', headers),
  };
}

function findHeaderIndex(
  normalizedHeaders: string[],
  headerName: string,
  originalHeaders: string[],
): number {
  const index = normalizedHeaders.findIndex(
    (header) => header === headerName || header.includes(headerName),
  );

  if (index >= 0) {
    return index;
  }

  throw new Error(
    `Braze voucher table is missing the "${headerName}" header. Found: ${
      originalHeaders.join(', ') || 'none'
    }.`,
  );
}

function readVoucherTableRow(
  cells: string[],
  headerIndexes: HeaderIndexes,
): VoucherTableRow | null {
  const requiredCellCount =
    Math.max(
      headerIndexes.displayName,
      headerIndexes.remaining,
      headerIndexes.total,
      headerIndexes.status,
    ) + 1;

  if (cells.length < requiredCellCount) {
    return null;
  }

  return {
    displayName: cells[headerIndexes.displayName],
    remaining: cells[headerIndexes.remaining],
    total: cells[headerIndexes.total],
    status: cells[headerIndexes.status],
  };
}

function hasRequiredHeaders(normalizedHeaders: string[]): boolean {
  return REQUIRED_HEADERS.every((requiredHeader) =>
    normalizedHeaders.some(
      (header) => header === requiredHeader || header.includes(requiredHeader),
    ),
  );
}

function normalizeCellText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeHeaderText(text: string): string {
  return normalizeCellText(text).toLowerCase();
}

function normalizeStatus(text: string): string {
  return normalizeCellText(text).toLowerCase();
}

async function isVisible(locator: Locator): Promise<boolean> {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function hasVisibleLocator(locator: Locator): Promise<boolean> {
  return (await locator.count()) > 0 && (await isVisible(locator.first()));
}

async function hasAttachedLocator(locator: Locator): Promise<boolean> {
  try {
    return (await locator.count()) > 0;
  } catch {
    return false;
  }
}

async function findVisibleLocator(locators: Locator[]): Promise<Locator | null> {
  for (const locator of locators) {
    if (await hasVisibleLocator(locator)) {
      return locator.first();
    }
  }

  return null;
}

async function waitForVisibleLocator(
  page: Page,
  locators: Locator[],
  timeoutMs = DEFAULT_TABLE_TIMEOUT_MS,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const locator = await findVisibleLocator(locators);

    if (locator) {
      return locator;
    }

    await page.waitForTimeout(250);
  }

  return null;
}

async function clickAndWaitForPossibleNavigation(
  page: Page,
  locator: Locator,
): Promise<void> {
  await locator.click();

  try {
    await page.waitForLoadState('networkidle', {
      timeout: 2_000,
    });
  } catch {
    // Detail panels and modals often update without navigation; the next control wait is decisive.
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
