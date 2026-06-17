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
```

Live commands require shared credentials and the target Braze environment:

```bash
LOGIN_USERNAME=
PASSWORD=
BRAZE_ENV_ID=
```

Voucher checks also require the minimum remaining-code threshold:

```bash
MIN_CODES_THRESHOLD=50
```

Voucher generation will use the Omio environment to choose the API base URL:

```bash
OMIO_ENV=QA
```

The Omio vouchers bulk job request body lives in:

```text
config/vouchers-bulk-job.json
```

To use a different body file for a run:

```bash
OMIO_VOUCHERS_BULK_BODY_PATH=path/to/body.json
```

To download vouchers for an existing bulk job without creating a new batch:

```bash
OMIO_VOUCHERS_BULK_JOB_ID=job-id yarn omio:vouchers-bulk
```

Add new live automation steps as Playwright specs under `tests/manual`. The aggregate
`braze:flow` command runs that folder, so new manual specs become part of the full
flow automatically.
