import { expect, test } from '@playwright/test';
import {
  filterActiveVoucherRowsBelowThreshold,
  formatActiveVoucherRow,
  parseVoucherCount,
  printActiveVoucherRows,
  printActiveVoucherRowsBelowThreshold,
  readActiveVoucherRows,
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

test('prints active voucher rows', () => {
  const output: string[] = [];

  printActiveVoucherRows(
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
    ],
    (message) => output.push(message),
  );

  expect(output).toEqual([
    'All ACTIVE Promotion Codes',
    'Display Name[Summer Reward] | Remaining Vouchers[45] | Total Vouchers[100]',
    'Display Name[VIP Voucher] | Remaining Vouchers[2,000] | Total Vouchers[5,000]',
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
