# crm-voucher-automation

## Commands

Run the mocked website test suite:

```bash
./node_modules/.bin/playwright test tests/website --project=chromium
```

Run the live replenishment flow:

```bash
yarn omio:vouchers-bulk-replenish
```

Run the live replenishment flow in a visible browser:

```bash
yarn omio:vouchers-bulk-replenish:headed
```

Live commands require shared credentials and one environment selector:

```bash
LOGIN_USERNAME=
PASSWORD=
ENV=QA
```

These values can live in a local `.env` file in the project root. The automation
loads `.env` automatically, and variables already set in your shell override
values from the file.

`ENV=QA` uses Braze environment `592d2af81b0e4d67991edb6b`.
`ENV=PROD` uses Braze environment `577e3b2a56ec312e6058236f`.
The current QA Omio vouchers API base URL is `http://localhost:8080/vouchers`.

Voucher checks also require the minimum remaining-code threshold:

```bash
MIN_CODES_THRESHOLD=50
```

Voucher generation uses the same `ENV` value to choose the Omio API base URL.
The replenishment command also requires the number of vouchers to create per
low Promotion Code list:

```bash
REPLENISH_BATCH_SIZE=25
```

`yarn omio:vouchers-bulk-replenish` logs into Braze first and prints the ACTIVE
Promotion Code lists below `MIN_CODES_THRESHOLD`. If none are below the
threshold, it exits without creating an Omio job.

For each low list, the Braze display name must contain a source Omio vouchers
bulk job id in this format:

```text
..._jobId_{jobIdHere}_...
```

The command fetches that source job with `GET private/v3/jobs/vouchers-bulk/{jobId}`,
reuses its `uppercaseIds` and `template`, overrides only `batchSize`, creates a
new vouchers bulk job, approves it, waits for completion, downloads the CSV, and
uploads it back to the matching Braze Promotion Code list.

Add new live automation steps as Playwright specs under `tests/manual`.
