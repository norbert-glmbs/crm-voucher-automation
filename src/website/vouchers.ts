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

const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
const DEFAULT_TABLE_TIMEOUT_MS = 30_000;
const REQUIRED_HEADERS = ['display name', 'remaining', 'total', 'status'];

export async function printActiveVoucherRowsFromBraze(
  page: Page,
  options: PrintActiveVoucherRowsOptions,
): Promise<ActiveVoucherRow[]> {
  await goToBrazeVouchersPage(page, options.vouchersUrl, options.navigationTimeoutMs);

  const activeRows = await readActiveVoucherRows(page, options.tableTimeoutMs);
  printActiveVoucherRows(activeRows, options.log);

  return activeRows;
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

export function printActiveVoucherRows(
  rows: ActiveVoucherRow[],
  log: (message: string) => void = console.log,
): void {
  log('All ACTIVE Promotion Codes')
  for (const row of rows) {
    log(formatActiveVoucherRow(row));
  }
}

export function formatActiveVoucherRow(row: ActiveVoucherRow): string {
  return `Display Name[${row.displayName}] | Remaining Vouchers[${row.remaining}] | Total Vouchers[${row.total}]`;
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
