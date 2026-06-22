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

Run the live create flow:

```bash
yarn omio:vouchers-bulk-create
```

Run the live create flow in a visible browser:

```bash
yarn omio:vouchers-bulk-create:headed
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

The create command requires a source vouchers bulk job, the new batch size, and
the Braze campaign/list name:

```bash
JOB_ID=97e114cb-362c-4261-b331-20d0ed16d98a
TARGET_BATCH_SIZE=25
CAMPAIGN_NAME=20260622_campaign
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
Low lists whose display name does not include a matching `jobId` are logged and
skipped.

`yarn omio:vouchers-bulk-create` logs into Braze, opens the Promotion Codes page,
then opens the new Promotion Code List form through the
`Create Promotion Code List` button or the direct
`/integrations/vouchers/new/{braze_env_id}` URL. It fills `Name` with
`{CAMPAIGN_NAME}_jobId_{JOB_ID}` and `Code Snippet Name` with `CAMPAIGN_NAME`.
It then fetches `GET private/v3/jobs/vouchers-bulk/{JOB_ID}`, reuses the source
job's `uppercaseIds` and `template`, overrides only `batchSize` with
`TARGET_BATCH_SIZE`, creates and approves a new Omio vouchers bulk job, waits for
completion, downloads the CSV, strips a leading `voucher_code` header if present,
and uploads the file into the new Braze Promotion Code list.

Add new live automation steps as Playwright specs under `tests/manual`.
