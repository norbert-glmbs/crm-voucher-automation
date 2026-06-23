# crm-voucher-automation

Playwright automation for Braze Promotion Code lists and Omio vouchers bulk jobs.

The project has two live flows:

- Replenish existing Braze Promotion Code lists whose remaining-code count is below a threshold.
- Create a new Braze Promotion Code list from an existing Omio vouchers bulk job.

## Prerequisites

- Node.js and Yarn installed locally.
- Access to the Braze dashboard with credentials that can run the required flow.
- Access to the Omio vouchers API for the selected environment.
- Chromium installed for Playwright.
- A local `.env` file with the required runtime values.

Live commands can create Omio jobs and upload CSV files into Braze. Check `ENV`
carefully before running them.

## Install

Install project dependencies:

```bash
yarn install
```

Install the Playwright Chromium browser if it is not already installed:

```bash
yarn playwright install
```

## Configure `.env`

The project loads a local `.env` file automatically from the repository root.
Values already set in your shell take precedence over values from `.env`.

Start by reviewing the example:

```bash
sed -n '1,200p' .env.example
```

Then create your local file:

```bash
cp .env.example .env
```

Edit `.env` and replace placeholder values with real values for the flow you
want to run. Do not commit `.env`; it is intentionally ignored by git.

### Common Values

Required for all live flows:

```bash
LOGIN_USERNAME=
PASSWORD=
ENV=QA
BRAZE_LOGIN_ALLOW_MANUAL_MFA=true
```

`ENV=QA` uses the QA profile. `ENV=PROD` uses the production profile. The same
`ENV` value selects both the Braze environment and the Omio vouchers API base
URL.

### Replenish Values

Required for `yarn omio:vouchers-bulk-replenish`:

```bash
MIN_CODES_THRESHOLD=50
REPLENISH_BATCH_SIZE=25
```

`MIN_CODES_THRESHOLD` controls which ACTIVE Promotion Code lists are considered
low. `REPLENISH_BATCH_SIZE` controls how many new vouchers are generated for
each low list. Values above `1000000` are capped to `1000000`.

### Create Values

Required for `yarn omio:vouchers-bulk-create`:

```bash
JOB_ID=97e114cb-362c-4261-b331-20d0ed16d98a
TARGET_BATCH_SIZE=25
CAMPAIGN_NAME=20260622_campaign
```

`JOB_ID` is the source Omio vouchers bulk job. `CAMPAIGN_NAME` must be unique in
Braze for the new Promotion Code list.

## Run Tests

Run the mocked website test suite:

```bash
./node_modules/.bin/playwright test tests/website --project=chromium
```

## Run Live Flows

Run the replenish flow:

```bash
yarn omio:vouchers-bulk-replenish
```

Run the replenish flow in a visible browser:

```bash
yarn omio:vouchers-bulk-replenish:headed
```

Run the create flow:

```bash
yarn omio:vouchers-bulk-create
```

Run the create flow in a visible browser:

```bash
yarn omio:vouchers-bulk-create:headed
```

## Replenish Flow

`yarn omio:vouchers-bulk-replenish`:

1. Logs into Braze.
2. Reads ACTIVE Promotion Code lists.
3. Finds lists where `Remaining < MIN_CODES_THRESHOLD`.
4. Extracts the source Omio job id from the Braze display name.
5. Creates, approves, waits for, and downloads new Omio voucher CSVs.
6. Uploads each generated CSV back into the matching Braze list.

For a list to be replenished, its Braze display name must contain a source Omio
job id in this format:

```text
..._jobId_{jobIdHere}_...
```

Lists without a matching `jobId` are logged and skipped.

## Create Flow

`yarn omio:vouchers-bulk-create`:

1. Logs into Braze.
2. Opens the new Promotion Code List form.
3. Sets `Name` to `{CAMPAIGN_NAME}_jobId_{JOB_ID}`.
4. Sets `Code Snippet Name` to `CAMPAIGN_NAME`.
5. Fetches `GET private/v3/jobs/vouchers-bulk/{JOB_ID}`.
6. Reuses the source job's `uppercaseIds` and `template`.
7. Creates, approves, waits for, and downloads new Omio voucher CSVs.
8. Uploads the generated CSV files into the new Braze Promotion Code list.

## Batch Size Behavior

`REPLENISH_BATCH_SIZE` is hard-capped at `1000000`. If a larger value is
configured, the extra amount is ignored and the replenish flow creates at most
`1000000` vouchers for each low Braze Promotion Code list.

The Omio vouchers bulk backend accepts at most `100000` vouchers per request.
If the effective replenish batch size or `TARGET_BATCH_SIZE` is larger than
`100000`, the automation splits the requested total into multiple Omio jobs and
uploads each generated CSV to the same Braze Promotion Code list.

## Generated Files

The automation can generate local browser auth state, Playwright reports, test
results, downloaded CSVs, and `.braze-upload.csv` files. These outputs are local
runtime artifacts and should not be committed.

Add new live automation steps as Playwright specs under `tests/manual`.
