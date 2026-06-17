# crm-voucher-automation

## Commands

Run the mocked website test suite:

```bash
yarn test
```

Run the complete live Braze flow:

```bash
yarn braze:flow
```

Run the complete live Braze flow in a visible browser:

```bash
yarn braze:flow:headed
```

Individual live steps are still available for debugging:

```bash
yarn braze:login
yarn braze:vouchers
```

Live Braze commands require credentials and the target environment:

```bash
BRAZE_USERNAME=
BRAZE_PASSWORD=
BRAZE_ENV_ID=
```

Voucher checks also require the minimum remaining-code threshold:

```bash
MIN_CODES_THRESHOLD=50
```

Add new live Braze steps as Playwright specs under `tests/manual`. The aggregate
`braze:flow` command runs that folder, so new manual specs become part of the full
flow automatically.
