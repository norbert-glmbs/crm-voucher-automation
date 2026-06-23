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

type UploadActiveVoucherRowCsvOptions = PrintActiveVoucherRowsOptions & {
  filePath: string;
  targetDisplayName: string;
};

type OpenNewPromotionCodeListOptions = {
  vouchersUrl: string;
  newVoucherUrl: string;
  displayName: string;
  codeSnippetName: string;
  navigationTimeoutMs?: number;
  formTimeoutMs?: number;
  log?: (message: string) => void;
};

type UploadOpenPromotionCodeListCsvOptions = {
  filePath: string;
  displayName?: string;
  log?: (message: string) => void;
};

export type UploadVoucherCsvResult = ActiveVoucherRow & {
  filePath: string;
  uploadedFilePath: string;
};

export type OpenNewPromotionCodeListResult = {
  displayName: string;
  codeSnippetName: string;
  finalUrl: string;
};

export type UploadOpenPromotionCodeListCsvResult = {
  filePath: string;
  uploadedFilePath: string;
  displayName?: string;
};

const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
const DEFAULT_TABLE_TIMEOUT_MS = 30_000;
const REQUIRED_HEADERS = ['display name', 'remaining', 'total', 'status'];
const FILE_CHOOSER_TIMEOUT_MS = 1_000;
const UPLOAD_CONTROL_TIMEOUT_MS = 30_000;
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

export async function uploadCsvToActiveVoucherRowFromBraze(
  page: Page,
  options: UploadActiveVoucherRowCsvOptions,
): Promise<UploadVoucherCsvResult> {
  await goToBrazeVouchersPage(page, options.vouchersUrl, options.navigationTimeoutMs);

  const activeRows = await readActiveVoucherRows(page, options.tableTimeoutMs);
  const rowToUpdate = activeRows.find(
    (row) => row.displayName === options.targetDisplayName,
  );

  if (!rowToUpdate) {
    throw new Error(
      `ACTIVE Promotion Code "${options.targetDisplayName}" was not found and cannot be selected for CSV upload.`,
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

export async function openNewPromotionCodeListFromBraze(
  page: Page,
  options: OpenNewPromotionCodeListOptions,
): Promise<OpenNewPromotionCodeListResult> {
  await goToBrazeVouchersPage(page, options.vouchersUrl, options.navigationTimeoutMs);

  await openNewPromotionCodeListForm(page, options);
  await fillNewPromotionCodeListFields(
    page,
    options.displayName,
    options.codeSnippetName,
    options.formTimeoutMs ?? options.navigationTimeoutMs ?? DEFAULT_TABLE_TIMEOUT_MS,
  );

  options.log?.(
    `Prepared new Braze Promotion Code list ${options.displayName} with Code Snippet Name ${options.codeSnippetName}`,
  );

  return {
    displayName: options.displayName,
    codeSnippetName: options.codeSnippetName,
    finalUrl: page.url(),
  };
}

export async function uploadCsvToOpenPromotionCodeListFromBraze(
  page: Page,
  options: UploadOpenPromotionCodeListCsvOptions,
): Promise<UploadOpenPromotionCodeListCsvResult> {
  const uploadedFilePath = await prepareCsvForBrazeUpload(options.filePath);

  options.log?.(`Uploading CSV ${uploadedFilePath}`);
  await uploadCsvToOpenVoucherList(page, uploadedFilePath);

  if (options.displayName) {
    options.log?.(`Uploaded CSV to Braze Promotion Code list ${options.displayName}`);
  } else {
    options.log?.('Uploaded CSV to open Braze Promotion Code list');
  }

  return {
    filePath: options.filePath,
    uploadedFilePath,
    displayName: options.displayName,
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
  const rows: ActiveVoucherRow[] = [];
  const seenRows = new Set<string>();
  const seenPages = new Set<string>();
  const deadline = Date.now() + tableTimeoutMs;

  while (Date.now() <= deadline) {
    const currentPageRows = await readActiveVoucherRowsFromCurrentPage(
      page,
      Math.max(deadline - Date.now(), 1),
    );
    const pageKey = await getVoucherTablePageKey(page, currentPageRows);

    if (!seenPages.has(pageKey)) {
      seenPages.add(pageKey);

      for (const row of currentPageRows) {
        const rowKey = `${row.displayName}\u0000${row.remaining}\u0000${row.total}`;

        if (!seenRows.has(rowKey)) {
          seenRows.add(rowKey);
          rows.push(row);
        }
      }
    }

    if (!(await clickVoucherTablePaginationButton(page, 'next'))) {
      break;
    }
  }

  await goToFirstVoucherTablePage(page);

  return rows;
}

async function readActiveVoucherRowsFromCurrentPage(
  page: Page,
  tableTimeoutMs: number,
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
  const jobId = findOmioVouchersBulkJobIdFromDisplayName(displayName);

  if (!jobId) {
    throw new Error(
      `Unable to extract Omio vouchers bulk jobId from Braze Promotion Code display name: ${displayName}`,
    );
  }

  return jobId;
}

export function findOmioVouchersBulkJobIdFromDisplayName(
  displayName: string,
): string | null {
  const match = displayName.match(OMIO_VOUCHERS_BULK_JOB_ID_PATTERN);

  return match?.[1] ?? null;
}

async function openNewPromotionCodeListForm(
  page: Page,
  options: OpenNewPromotionCodeListOptions,
): Promise<void> {
  const createButton = await waitForVisibleLocator(
    page,
    [
      page.getByRole('button', { name: /create promotion code list/i }),
      page.getByRole('link', { name: /create promotion code list/i }),
      page.getByText(/create promotion code list/i),
    ],
    Math.min(options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS, 5_000),
  );

  if (createButton) {
    options.log?.('Opening Braze Create Promotion Code List form');
    await clickAndWaitForPossibleNavigation(page, createButton);
    return;
  }

  options.log?.(
    `Create Promotion Code List button was not visible; opening ${options.newVoucherUrl}`,
  );
  await page.goto(options.newVoucherUrl, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForLoadState('networkidle', {
      timeout: Math.min(
        options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS,
        5_000,
      ),
    });
  } catch {
    // Braze pages may keep background requests open; the form wait below is decisive.
  }
}

async function fillNewPromotionCodeListFields(
  page: Page,
  displayName: string,
  codeSnippetName: string,
  timeoutMs: number,
): Promise<void> {
  const nameInput = await waitForVisibleLocator(
    page,
    [
      page.getByRole('textbox', { name: /^name$/i }),
      page.getByLabel(/^name$/i),
      page.getByPlaceholder(/enter promotion code name|^name$/i),
      page.locator('input.db-name-description--name-input').first(),
      page
        .locator(
          'input[name="name"], input[id="name"], input[name$="[name]"], input[id$="_name"]',
        )
        .first(),
    ],
    timeoutMs,
  );

  if (!nameInput) {
    throw new Error('Braze Promotion Code List Name input was not visible.');
  }

  await nameInput.fill(displayName);

  const codeSnippetNameInput = await waitForVisibleLocator(
    page,
    [
      page.getByRole('textbox', { name: /code snippet name/i }),
      page.getByLabel(/code snippet name/i),
      page.getByPlaceholder(/code snippet name/i),
      page.locator('#db-voucher-editor-code-snippet-name-field').first(),
      page
        .locator(
          'input[name*="code_snippet" i], input[name*="snippet" i], input[id*="code_snippet" i], input[id*="code-snippet" i]',
        )
        .first(),
    ],
    timeoutMs,
  );

  if (!codeSnippetNameInput) {
    throw new Error('Braze Code Snippet Name input was not visible.');
  }

  await codeSnippetNameInput.fill(codeSnippetName);
}

async function readVoucherTableModel(
  page: Page,
  timeoutMs: number,
): Promise<VoucherTableModel> {
  const deadline = Date.now() + timeoutMs;
  const tableCandidates = page.locator('table, [role="table"], [role="grid"]');
  const seenHeaderSets = new Set<string>();
  let emptyTableWithRequiredHeaders: VoucherTableModel | null = null;

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
        if (table.rows.length > 0) {
          return table;
        }

        emptyTableWithRequiredHeaders = table;
      }
    }

    await page.waitForTimeout(250);
  }

  if (emptyTableWithRequiredHeaders) {
    return emptyTableWithRequiredHeaders;
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
  const seenPages = new Set<string>();

  await goToFirstVoucherTablePage(page);

  while (Date.now() <= deadline) {
    const pageKey = await getVoucherTablePageKey(page);

    if (!seenPages.has(pageKey)) {
      seenPages.add(pageKey);

      const row = await findVoucherTableRowByDisplayNameOnCurrentPage(
        page,
        displayName,
        Math.max(deadline - Date.now(), 1),
      );

      if (row) {
        return row;
      }
    }

    if (!(await clickVoucherTablePaginationButton(page, 'next'))) {
      break;
    }
  }

  throw new Error(`Braze voucher table row "${displayName}" was not visible.`);
}

async function findVoucherTableRowByDisplayNameOnCurrentPage(
  page: Page,
  displayName: string,
  timeoutMs: number,
): Promise<Locator | null> {
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

      if (rows.length > 0) {
        return null;
      }
    }

    await page.waitForTimeout(250);
  }

  return null;
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

async function goToFirstVoucherTablePage(page: Page): Promise<void> {
  const seenPageKeys = new Set<string>();

  for (let attempts = 0; attempts < 100; attempts += 1) {
    const pageKey = await getVoucherTablePageKey(page);

    if (seenPageKeys.has(pageKey)) {
      return;
    }

    seenPageKeys.add(pageKey);

    if (!(await clickVoucherTablePaginationButton(page, 'previous'))) {
      return;
    }
  }
}

async function clickVoucherTablePaginationButton(
  page: Page,
  direction: 'next' | 'previous',
): Promise<boolean> {
  const buttonLabel = direction === 'next' ? 'Next page' : 'Previous page';
  const button = await findVisibleEnabledLocator([
    page.getByRole('button', { name: new RegExp(`^${buttonLabel}$`, 'i') }),
    page.getByRole('link', { name: new RegExp(`^${buttonLabel}$`, 'i') }),
    page.locator(`button[aria-label="${buttonLabel}"]`),
    page.locator(`a[aria-label="${buttonLabel}"]`),
  ]);

  if (!button) {
    return false;
  }

  const previousPageKey = await getVoucherTablePageKey(page);

  await clickAndWaitForPossibleNavigation(page, button);
  await waitForVoucherTablePageKeyChange(page, previousPageKey);

  return true;
}

async function waitForVoucherTablePageKeyChange(
  page: Page,
  previousPageKey: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const currentPageKey = await getVoucherTablePageKey(page);

    if (currentPageKey !== previousPageKey) {
      return;
    }

    await page.waitForTimeout(250);
  }
}

async function getVoucherTablePageKey(
  page: Page,
  rows: ActiveVoucherRow[] = [],
): Promise<string> {
  const showingRowsText = await optionalText(
    page.locator('.pagination-footer-properties__showing-text').first(),
  );
  const currentPage = page.locator('[aria-current="page"]').first();
  const currentPageLabel = await optionalAttribute(currentPage, 'aria-label');
  const currentPageText = await optionalText(currentPage);
  const rowText =
    rows.length > 0
      ? rows
          .map((row) => `${row.displayName}:${row.remaining}:${row.total}`)
          .join('|')
      : await firstOptionalText([
          page.locator('table tbody tr').first(),
          page.locator('[role="row"]').nth(1),
          page.locator('table tr').nth(1),
        ]);

  return (
    [showingRowsText, currentPageLabel, currentPageText, rowText]
      .map(normalizeCellText)
      .filter((value) => value.length > 0)
      .join(' || ') || page.url()
  );
}

async function uploadCsvToOpenVoucherList(page: Page, filePath: string): Promise<void> {
  const fileInput = await waitForAttachedLocator(
    page,
    [
      page.locator('#db-voucher-editor-promo-code-file-selector'),
      page.locator('input.db-file-selector-input[type="file"]'),
      page.locator('.db-file-selector input[type="file"]'),
      page.locator('input[type="file"][accept*="csv" i]'),
      page.locator('input[type="file"]'),
    ],
    UPLOAD_CONTROL_TIMEOUT_MS,
  );
  let usedAttachedFileInput = false;

  if (fileInput) {
    await fileInput.setInputFiles(filePath);
    usedAttachedFileInput = true;
  } else {
    const uploadTrigger = await waitForVisibleLocator(
      page,
      [
        page.locator('.db-file-selector-dropzone').getByRole('button', {
          name: /upload csv/i,
        }),
        page.locator('.db-file-selector').getByRole('button', {
          name: /upload csv/i,
        }),
        page.getByRole('button', { name: /upload csv/i }),
        page.getByRole('link', { name: /upload csv/i }),
      ],
      UPLOAD_CONTROL_TIMEOUT_MS,
    );

    if (!uploadTrigger) {
      throw new Error('Braze Upload CSV control was not visible.');
    }

    const fileChooserPromise = page
      .waitForEvent('filechooser', { timeout: FILE_CHOOSER_TIMEOUT_MS })
      .catch(() => null);

    await uploadTrigger.click();

    const fileChooser = await fileChooserPromise;

    if (fileChooser) {
      await fileChooser.setFiles(filePath);
    } else {
      const fallbackFileInput = await waitForAttachedLocator(
        page,
        [page.locator('input[type="file"]')],
        FILE_CHOOSER_TIMEOUT_MS,
      );

      if (!fallbackFileInput) {
        throw new Error('Braze Upload CSV file input was not attached.');
      }

      await fallbackFileInput.setInputFiles(filePath);
    }
  }

  let startUploadButton = await waitForStartUploadButton(
    page,
    usedAttachedFileInput ? FILE_CHOOSER_TIMEOUT_MS : DEFAULT_TABLE_TIMEOUT_MS,
  );

  if (!startUploadButton && usedAttachedFileInput && fileInput) {
    const uploadTrigger = await waitForVisibleLocator(
      page,
      [
        page.locator('.db-file-selector-dropzone').getByRole('button', {
          name: /upload csv/i,
        }),
        page.locator('.db-file-selector').getByRole('button', {
          name: /upload csv/i,
        }),
        page.getByRole('button', { name: /upload csv/i }),
        page.getByRole('link', { name: /upload csv/i }),
      ],
      FILE_CHOOSER_TIMEOUT_MS,
    );

    if (uploadTrigger) {
      await clickAndWaitForPossibleNavigation(page, uploadTrigger);
      await fileInput.setInputFiles(filePath);
    }

    startUploadButton = await waitForStartUploadButton(page);
  }

  if (!startUploadButton) {
    throw new Error('Braze Start Upload button was not visible.');
  }

  await clickAndWaitForPossibleNavigation(page, startUploadButton);

  const updateButton = await waitForVisibleEnabledLocator(page, [
    page.getByRole('button', { name: /^(update list|create list|save list)$/i }),
    page
      .locator('button')
      .filter({ hasText: /^\s*(Update List|Create List|Save List)\s*$/i }),
  ]);

  if (!updateButton) {
    throw new Error('Braze Update/Create list button was not visible.');
  }

  await clickAndWaitForPossibleNavigation(page, updateButton);
}

async function waitForStartUploadButton(
  page: Page,
  timeoutMs = DEFAULT_TABLE_TIMEOUT_MS,
): Promise<Locator | null> {
  return waitForVisibleEnabledLocator(
    page,
    [
      page
        .locator('[role="dialog"] .bcl-modal-footer')
        .getByRole('button', { name: /^start upload$/i }),
      page.locator('[role="dialog"]').getByRole('button', {
        name: /^start upload$/i,
      }),
      page.getByRole('button', { name: /^start upload$/i }),
      page
        .locator('button')
        .filter({ hasText: /^\s*Start Upload\s*$/i }),
    ],
    timeoutMs,
  );
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

async function optionalText(locator: Locator): Promise<string> {
  try {
    if ((await locator.count()) === 0) {
      return '';
    }

    return normalizeCellText((await locator.first().textContent()) ?? '');
  } catch {
    return '';
  }
}

async function optionalAttribute(
  locator: Locator,
  attributeName: string,
): Promise<string> {
  try {
    if ((await locator.count()) === 0) {
      return '';
    }

    return (await locator.first().getAttribute(attributeName)) ?? '';
  } catch {
    return '';
  }
}

async function firstOptionalText(locators: Locator[]): Promise<string> {
  for (const locator of locators) {
    const text = await optionalText(locator);

    if (text) {
      return text;
    }
  }

  return '';
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

async function hasVisibleEnabledLocator(locator: Locator): Promise<boolean> {
  try {
    if ((await locator.count()) === 0) {
      return false;
    }

    const target = locator.first();
    const ariaDisabled = await target.getAttribute('aria-disabled');
    const dataStyle = await target.getAttribute('data-style');

    return (
      (await locator.count()) > 0 &&
      (await target.isVisible()) &&
      (await target.isEnabled()) &&
      ariaDisabled !== 'true' &&
      dataStyle !== 'disabled'
    );
  } catch {
    return false;
  }
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

async function findVisibleEnabledLocator(
  locators: Locator[],
): Promise<Locator | null> {
  for (const locator of locators) {
    if (await hasVisibleEnabledLocator(locator)) {
      return locator.first();
    }
  }

  return null;
}

async function waitForAttachedLocator(
  page: Page,
  locators: Locator[],
  timeoutMs = DEFAULT_TABLE_TIMEOUT_MS,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    for (const locator of locators) {
      if (await hasAttachedLocator(locator)) {
        return locator.first();
      }
    }

    await page.waitForTimeout(250);
  }

  return null;
}

async function waitForVisibleEnabledLocator(
  page: Page,
  locators: Locator[],
  timeoutMs = DEFAULT_TABLE_TIMEOUT_MS,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const locator = await findVisibleEnabledLocator(locators);

    if (locator) {
      return locator;
    }

    await page.waitForTimeout(250);
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
