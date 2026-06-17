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

Add new live Braze steps as Playwright specs under `tests/manual`. The aggregate
`braze:flow` command runs that folder, so new manual specs become part of the full
flow automatically.
