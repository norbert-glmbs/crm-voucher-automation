import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  extractOmioVouchersBulkJobIdFromDisplayName,
  filterActiveVoucherRowsBelowThreshold,
  formatActiveVoucherRow,
  findOmioVouchersBulkJobIdFromDisplayName,
  openNewPromotionCodeListFromBraze,
  parseVoucherCount,
  printActiveVoucherRowsBelowThreshold,
  readActiveVoucherRows,
  uploadCsvToActiveVoucherRowBelowThresholdFromBraze,
  uploadCsvToOpenPromotionCodeListFromBraze,
} from '../../src/website/vouchers';

test('reads active voucher rows from a native table', async ({ page }) => {
  await page.setContent(`
    <main>
      <table>
        <thead>
          <tr>
            <th>Display Name</th>
            <th>Status</th>
            <th>Remaining</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Summer Reward</td>
            <td>Active</td>
            <td>45</td>
            <td>100</td>
          </tr>
          <tr>
            <td>Paused Reward</td>
            <td>Inactive</td>
            <td>12</td>
            <td>50</td>
          </tr>
          <tr>
            <td>Welcome Credit</td>
            <td> active </td>
            <td>8</td>
            <td>10</td>
          </tr>
        </tbody>
      </table>
    </main>
  `);

  await expect(readActiveVoucherRows(page, 1_000)).resolves.toEqual([
    {
      displayName: 'Summer Reward',
      remaining: '45',
      total: '100',
    },
    {
      displayName: 'Welcome Credit',
      remaining: '8',
      total: '10',
    },
  ]);
});

test('reads active voucher rows from an ARIA grid', async ({ page }) => {
  await page.setContent(`
    <main>
      <div role="grid">
        <div role="row">
          <div role="columnheader">Display Name</div>
          <div role="columnheader">Remaining</div>
          <div role="columnheader">Total</div>
          <div role="columnheader">Status</div>
        </div>
        <div role="row">
          <div role="gridcell">VIP Voucher</div>
          <div role="gridcell">2,000</div>
          <div role="gridcell">5,000</div>
          <div role="gridcell">Active</div>
        </div>
        <div role="row">
          <div role="gridcell">Expired Voucher</div>
          <div role="gridcell">0</div>
          <div role="gridcell">100</div>
          <div role="gridcell">Expired</div>
        </div>
      </div>
    </main>
  `);

  await expect(readActiveVoucherRows(page, 1_000)).resolves.toEqual([
    {
      displayName: 'VIP Voucher',
      remaining: '2,000',
      total: '5,000',
    },
  ]);
});

test('formats one active voucher row', () => {
  expect(
    formatActiveVoucherRow({
      displayName: 'Welcome Credit',
      remaining: '8',
      total: '10',
    }),
  ).toBe('Display Name[Welcome Credit] | Remaining Vouchers[8] | Total Vouchers[10]');
});

test('filters active voucher rows below the minimum codes threshold', () => {
  expect(
    filterActiveVoucherRowsBelowThreshold(
      [
        {
          displayName: 'Summer Reward',
          remaining: '45',
          total: '100',
        },
        {
          displayName: 'VIP Voucher',
          remaining: '2,000',
          total: '5,000',
        },
        {
          displayName: 'Welcome Credit',
          remaining: '8',
          total: '10',
        },
      ],
      50,
    ),
  ).toEqual([
    {
      displayName: 'Summer Reward',
      remaining: '45',
      total: '100',
    },
    {
      displayName: 'Welcome Credit',
      remaining: '8',
      total: '10',
    },
  ]);
});

test('prints active voucher rows below the minimum codes threshold', () => {
  const output: string[] = [];

  printActiveVoucherRowsBelowThreshold(
    [
      {
        displayName: 'Summer Reward',
        remaining: '45',
        total: '100',
      },
    ],
    50,
    (message) => output.push(message),
  );

  expect(output).toEqual([
    'ACTIVE Promotion Codes below MIN_CODES_THRESHOLD[50]',
    'Display Name[Summer Reward] | Remaining Vouchers[45] | Total Vouchers[100]',
  ]);
});

test('prints a clear message when no active voucher rows are below the threshold', () => {
  const output: string[] = [];

  printActiveVoucherRowsBelowThreshold([], 50, (message) => output.push(message));

  expect(output).toEqual(['No ACTIVE Promotion Codes below MIN_CODES_THRESHOLD[50]']);
});

test('parses voucher counts with thousands separators', () => {
  expect(parseVoucherCount('2,000')).toBe(2000);
  expect(parseVoucherCount(' 45 ')).toBe(45);
});

test('fails clearly when a voucher count cannot be parsed', () => {
  expect(() => parseVoucherCount('not available', 'VIP Voucher remaining')).toThrow(
    'Unable to parse VIP Voucher remaining: not available',
  );
});

test('extracts an Omio vouchers bulk job id from a Braze display name', () => {
  expect(
    extractOmioVouchersBulkJobIdFromDisplayName(
      'norbert_test_2_jobId_97e114cb-362c-4261-b331-20d0ed16d98a',
    ),
  ).toBe('97e114cb-362c-4261-b331-20d0ed16d98a');
  expect(
    extractOmioVouchersBulkJobIdFromDisplayName(
      'prefix_jobId_97e114cb-362c-4261-b331-20d0ed16d98a_suffix',
    ),
  ).toBe('97e114cb-362c-4261-b331-20d0ed16d98a');
});

test('finds no Omio vouchers bulk job id when a Braze display name does not include one', () => {
  expect(findOmioVouchersBulkJobIdFromDisplayName('norbert_test_2')).toBeNull();
});

test('fails clearly when a Braze display name has no Omio vouchers bulk job id', () => {
  expect(() => extractOmioVouchersBulkJobIdFromDisplayName('norbert_test_2')).toThrow(
    'Unable to extract Omio vouchers bulk jobId from Braze Promotion Code display name: norbert_test_2',
  );
});

test('opens and fills a new promotion code list from the create button', async ({
  page,
}) => {
  await page.route('https://braze.example/vouchers', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <main>
          <button id="create-list">Create Promotion Code List</button>
          <section id="details"></section>
          <script>
            document.getElementById('create-list').addEventListener('click', function () {
              document.getElementById('details').innerHTML =
                '<label>Name <input id="name" /></label>' +
                '<label>Code Snippet Name <input id="code-snippet-name" /></label>';
            });
          </script>
        </main>
      `,
    });
  });

  const result = await openNewPromotionCodeListFromBraze(page, {
    vouchersUrl: 'https://braze.example/vouchers',
    newVoucherUrl: 'https://braze.example/vouchers/new/test-env',
    displayName: '20260622_campaign_jobId_97e114cb-362c-4261-b331-20d0ed16d98a',
    codeSnippetName: '20260622_campaign',
    navigationTimeoutMs: 1_000,
    formTimeoutMs: 1_000,
  });

  expect(result).toMatchObject({
    displayName: '20260622_campaign_jobId_97e114cb-362c-4261-b331-20d0ed16d98a',
    codeSnippetName: '20260622_campaign',
  });
  await expect(page.locator('#name')).toHaveValue(
    '20260622_campaign_jobId_97e114cb-362c-4261-b331-20d0ed16d98a',
  );
  await expect(page.locator('#code-snippet-name')).toHaveValue('20260622_campaign');
});

test('fills the real Braze promotion code list input selectors', async ({ page }) => {
  await page.route('https://braze.example/vouchers', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<main><h1>Promotion Codes</h1></main>',
    });
  });
  await page.route('https://braze.example/vouchers/new/test-env', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <main id="main-content">
          <form class="db-voucher-editor">
            <section>
              <header>Promotion Code List</header>
              <fieldset class="db-name-description">
                <label class="bcl-field-label">Name</label>
                <div class="bcl-field-label-body">
                  <input
                    placeholder="Enter Promotion Code Name"
                    class="bcl-input db-name-description--name-input"
                    type="text"
                    value=""
                  >
                </div>
              </fieldset>
              <fieldset>
                <legend><h4>Code Snippet</h4></legend>
                <label class="bcl-field-label">Code Snippet Name</label>
                <div class="bcl-field-label-body">
                  <input
                    id="db-voucher-editor-code-snippet-name-field"
                    class="bcl-input"
                    type="text"
                    value=""
                  >
                </div>
              </fieldset>
            </section>
          </form>
        </main>
      `,
    });
  });

  await openNewPromotionCodeListFromBraze(page, {
    vouchersUrl: 'https://braze.example/vouchers',
    newVoucherUrl: 'https://braze.example/vouchers/new/test-env',
    displayName: '20260622_campaign_jobId_97e114cb-362c-4261-b331-20d0ed16d98a',
    codeSnippetName: '20260622_campaign',
    navigationTimeoutMs: 1_000,
    formTimeoutMs: 1_000,
  });

  await expect(page.locator('.db-name-description--name-input')).toHaveValue(
    '20260622_campaign_jobId_97e114cb-362c-4261-b331-20d0ed16d98a',
  );
  await expect(page.locator('#db-voucher-editor-code-snippet-name-field')).toHaveValue(
    '20260622_campaign',
  );
});

test('opens the new promotion code list URL when the create button is unavailable', async ({
  page,
}) => {
  await page.route('https://braze.example/vouchers', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<main><h1>Promotion Codes</h1></main>',
    });
  });
  await page.route('https://braze.example/vouchers/new/test-env', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <main>
          <label>Name <input id="name" /></label>
          <label>Code Snippet Name <input id="code-snippet-name" /></label>
        </main>
      `,
    });
  });

  const result = await openNewPromotionCodeListFromBraze(page, {
    vouchersUrl: 'https://braze.example/vouchers',
    newVoucherUrl: 'https://braze.example/vouchers/new/test-env',
    displayName: '20260622_campaign_jobId_97e114cb-362c-4261-b331-20d0ed16d98a',
    codeSnippetName: '20260622_campaign',
    navigationTimeoutMs: 1_000,
    formTimeoutMs: 1_000,
  });

  expect(result.finalUrl).toBe('https://braze.example/vouchers/new/test-env');
  await expect(page.locator('#name')).toHaveValue(
    '20260622_campaign_jobId_97e114cb-362c-4261-b331-20d0ed16d98a',
  );
  await expect(page.locator('#code-snippet-name')).toHaveValue('20260622_campaign');
});

test('uploads a CSV to an open new promotion code list', async ({ page }, testInfo) => {
  const csvPath = testInfo.outputPath('new-list-vouchers.csv');
  await writeFile(csvPath, 'voucher_code\nNEW123\n', 'utf8');
  await page.setContent(`
    <main>
      <button id="show-upload">Upload CSV</button>
      <div id="upload-controls" hidden>
        <input id="voucher-file" type="file">
        <button id="start-upload">Start Upload</button>
      </div>
      <button id="create-list" disabled>Create list</button>
      <div id="uploaded-file"></div>
      <script>
        document.getElementById('show-upload').addEventListener('click', function () {
          document.getElementById('upload-controls').hidden = false;
        });
        document.getElementById('start-upload').addEventListener('click', async function () {
          const file = document.getElementById('voucher-file').files[0];
          document.getElementById('create-list').disabled = false;
          window.uploadedCsvContent = file ? await file.text() : 'missing';
        });
        document.getElementById('create-list').addEventListener('click', function () {
          document.getElementById('uploaded-file').textContent = window.uploadedCsvContent || 'missing';
        });
      </script>
    </main>
  `);

  const result = await uploadCsvToOpenPromotionCodeListFromBraze(page, {
    filePath: csvPath,
    displayName: '20260622_campaign',
  });

  expect(result).toEqual({
    filePath: csvPath,
    uploadedFilePath: csvPath.replace('.csv', '.braze-upload.csv'),
    displayName: '20260622_campaign',
  });
  await expect(page.locator('#uploaded-file')).toHaveText('NEW123\n');
  await expect(readFile(result.uploadedFilePath, 'utf8')).resolves.toBe('NEW123\n');
});

test('uploads a CSV to the first active voucher row below threshold', async ({
  page,
}, testInfo) => {
  const csvPath = testInfo.outputPath('vouchers.csv');
  const output: string[] = [];
  await writeFile(csvPath, 'voucher_code\nABC123\n', 'utf8');
  await page.route('https://braze.example/vouchers', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <main>
          <table>
            <thead>
              <tr>
                <th>Display Name</th>
                <th>Status</th>
                <th>Remaining</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><button onclick="openVoucherList('Summer Reward')">Summer Reward</button></td>
                <td>Active</td>
                <td>45</td>
                <td>100</td>
              </tr>
              <tr>
                <td><button onclick="openVoucherList('VIP Voucher')">VIP Voucher</button></td>
                <td>Active</td>
                <td>2,000</td>
                <td>5,000</td>
              </tr>
            </tbody>
          </table>
          <section id="details"></section>
          <script>
            function openVoucherList(name) {
              document.getElementById('details').innerHTML =
                '<h1 id="opened-name">' + name + '</h1>' +
                '<button id="show-upload">Upload CSV</button>' +
                '<div id="upload-controls" hidden>' +
                  '<input id="voucher-file" type="file">' +
                  '<button id="start-upload">Start Upload</button>' +
                '</div>' +
                '<button id="update-list" disabled>Update list</button>' +
                '<div id="started-upload"></div>' +
                '<div id="uploaded-file"></div>';
              document.getElementById('show-upload').addEventListener('click', function () {
                document.getElementById('upload-controls').hidden = false;
              });
              document.getElementById('start-upload').addEventListener('click', async function () {
                const file = document.getElementById('voucher-file').files[0];
                document.getElementById('started-upload').textContent = file ? file.name : 'missing';
                document.getElementById('update-list').disabled = false;
                window.uploadedCsvContent = file ? await file.text() : 'missing';
              });
              document.getElementById('update-list').addEventListener('click', function () {
                document.getElementById('uploaded-file').textContent = window.uploadedCsvContent || 'missing';
              });
            }
          </script>
        </main>
      `,
    });
  });

  const result = await uploadCsvToActiveVoucherRowBelowThresholdFromBraze(
    page,
    {
      vouchersUrl: 'https://braze.example/vouchers',
      minCodesThreshold: 50,
      filePath: csvPath,
      navigationTimeoutMs: 1_000,
      tableTimeoutMs: 1_000,
      log: (message) => output.push(message),
    },
  );

  expect(result).toEqual({
    displayName: 'Summer Reward',
    remaining: '45',
    total: '100',
    filePath: csvPath,
    uploadedFilePath: csvPath.replace('.csv', '.braze-upload.csv'),
  });
  await expect(page.locator('#opened-name')).toHaveText('Summer Reward');
  await expect(page.locator('#started-upload')).toHaveText('vouchers.braze-upload.csv');
  await expect(page.locator('#uploaded-file')).toHaveText('ABC123\n');
  await expect(readFile(result.uploadedFilePath, 'utf8')).resolves.toBe('ABC123\n');
  expect(output).toContain('Opening Braze Promotion Code list Summer Reward');
  expect(output).toContain(`Uploading CSV ${result.uploadedFilePath}`);
  expect(output).toContain('Uploaded CSV to Braze Promotion Code list Summer Reward');
});

test('uploads a CSV to the requested active voucher row below threshold', async ({
  page,
}, testInfo) => {
  const csvPath = testInfo.outputPath('targeted-vouchers.csv');
  await writeFile(csvPath, 'voucher_code\nTARGET123\n', 'utf8');
  await page.route('https://braze.example/vouchers', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <main>
          <table>
            <thead>
              <tr>
                <th>Display Name</th>
                <th>Status</th>
                <th>Remaining</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><button onclick="openVoucherList('Summer Reward')">Summer Reward</button></td>
                <td>Active</td>
                <td>45</td>
                <td>100</td>
              </tr>
              <tr>
                <td><button onclick="openVoucherList('Welcome Credit')">Welcome Credit</button></td>
                <td>Active</td>
                <td>8</td>
                <td>10</td>
              </tr>
            </tbody>
          </table>
          <section id="details"></section>
          <script>
            function openVoucherList(name) {
              document.getElementById('details').innerHTML =
                '<h1 id="opened-name">' + name + '</h1>' +
                '<button id="show-upload">Upload CSV</button>' +
                '<div id="upload-controls" hidden>' +
                  '<input id="voucher-file" type="file">' +
                  '<button id="start-upload">Start Upload</button>' +
                '</div>' +
                '<button id="update-list" disabled>Update list</button>' +
                '<div id="uploaded-file"></div>';
              document.getElementById('show-upload').addEventListener('click', function () {
                document.getElementById('upload-controls').hidden = false;
              });
              document.getElementById('start-upload').addEventListener('click', async function () {
                const file = document.getElementById('voucher-file').files[0];
                document.getElementById('update-list').disabled = false;
                window.uploadedCsvContent = file ? await file.text() : 'missing';
              });
              document.getElementById('update-list').addEventListener('click', function () {
                document.getElementById('uploaded-file').textContent = window.uploadedCsvContent || 'missing';
              });
            }
          </script>
        </main>
      `,
    });
  });

  const result = await uploadCsvToActiveVoucherRowBelowThresholdFromBraze(
    page,
    {
      vouchersUrl: 'https://braze.example/vouchers',
      minCodesThreshold: 50,
      filePath: csvPath,
      targetDisplayName: 'Welcome Credit',
      navigationTimeoutMs: 1_000,
      tableTimeoutMs: 1_000,
    },
  );

  expect(result).toEqual({
    displayName: 'Welcome Credit',
    remaining: '8',
    total: '10',
    filePath: csvPath,
    uploadedFilePath: csvPath.replace('.csv', '.braze-upload.csv'),
  });
  await expect(page.locator('#opened-name')).toHaveText('Welcome Credit');
  await expect(page.locator('#uploaded-file')).toHaveText('TARGET123\n');
  await expect(readFile(result.uploadedFilePath, 'utf8')).resolves.toBe(
    'TARGET123\n',
  );
});

test('fails clearly when no active voucher rows below threshold are available for upload', async ({
  page,
}, testInfo) => {
  const csvPath = testInfo.outputPath('vouchers.csv');
  await writeFile(csvPath, 'voucher_id\nABC123\n', 'utf8');
  await page.route('https://braze.example/vouchers', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <main>
          <table>
            <thead>
              <tr>
                <th>Display Name</th>
                <th>Status</th>
                <th>Remaining</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>VIP Voucher</td>
                <td>Active</td>
                <td>2,000</td>
                <td>5,000</td>
              </tr>
            </tbody>
          </table>
        </main>
      `,
    });
  });

  await expect(
    uploadCsvToActiveVoucherRowBelowThresholdFromBraze(page, {
      vouchersUrl: 'https://braze.example/vouchers',
      minCodesThreshold: 50,
      filePath: csvPath,
      navigationTimeoutMs: 1_000,
      tableTimeoutMs: 1_000,
    }),
  ).rejects.toThrow(
    'No ACTIVE Promotion Codes below MIN_CODES_THRESHOLD[50] were available for CSV upload.',
  );
});
