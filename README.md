# crm-voucher-automation

## Commands

Run the mocked website test suite:

```bash
yarn test
```

Run the complete live automation flow:

```bash
yarn braze:flow
```

Run the complete live automation flow in a visible browser:

```bash
yarn braze:flow:headed
```

Individual live steps are still available for debugging:

```bash
yarn braze:login
yarn braze:vouchers
yarn omio:auth
yarn omio:vouchers-bulk
yarn omio:vouchers-bulk:headed
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

Voucher checks also require the minimum remaining-code threshold:

```bash
MIN_CODES_THRESHOLD=50
```

Voucher generation uses the same `ENV` value to choose the Omio API base URL.

The Omio vouchers bulk job request body lives in:

```text
config/vouchers-bulk-job.json
```

To use a different body file for a run:

```bash
OMIO_VOUCHERS_BULK_BODY_PATH=path/to/body.json
```

`yarn omio:vouchers-bulk` logs into Braze first and prints the ACTIVE Promotion
Code lists below `MIN_CODES_THRESHOLD`. If none are below the threshold, it exits
without creating an Omio job. If one or more lists are below the threshold, it
creates, approves, waits for, downloads, and uploads one Omio vouchers bulk batch
for each low Braze list.

To download vouchers for an existing bulk job without creating a new batch:

```bash
OMIO_VOUCHERS_BULK_JOB_ID=job-id yarn omio:vouchers-bulk
```

When `OMIO_VOUCHERS_BULK_JOB_ID` is set, the flow still checks Braze first. If
there is at least one low list, it downloads that existing job and uploads it to
the first low list only.

Add new live automation steps as Playwright specs under `tests/manual`. The aggregate
`braze:flow` command runs that folder, so new manual specs become part of the full
flow automatically.
