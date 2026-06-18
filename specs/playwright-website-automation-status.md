# Playwright Website Automation Status

Last updated: 2026-06-18

Audit scope: current repository code and visible working-tree changes. The root-level `automation-plan.md` and `status.md` files do not exist; the docs being maintained are `specs/playwright-website-automation-plan.md` and this file.

## Completed In Code

- [x] Chose the existing root Playwright project as the implementation location instead of creating a nested `automation/` project.
- [x] Added runtime secret and generated-state ignores for `.env`, `.playwright/`, Playwright reports, test results, coverage, build output, logs, and editor files.
- [x] Added automatic `.env` loading without overriding variables that are already set in the shell.
- [x] Added `ENV` configuration so Braze and Omio targets can be selected with `ENV=QA` or `ENV=PROD`.
- [x] Added Braze environment ID mapping for QA and PROD.
- [x] Added Braze app usage URL generation.
- [x] Added Braze vouchers URL generation for `https://dashboard-01.braze.com/integrations/vouchers/vouchers/{envId}?locale=en`.
- [x] Added shared `LOGIN_USERNAME` and `PASSWORD` configuration for Braze login and Omio client-credentials authentication.
- [x] Added validation for required credentials.
- [x] Added `BRAZE_AUTH_STATE_PATH`, `BRAZE_LOGIN_ALLOW_MANUAL_MFA`, `BRAZE_LOGIN_MFA_TIMEOUT_MS`, and `BRAZE_LOGIN_NAVIGATION_TIMEOUT_MS` configuration.
- [x] Implemented `loginToBraze` for the Braze username/password login flow.
- [x] Implemented Braze auth state persistence to `.playwright/.auth/braze.json` by default.
- [x] Implemented manual-spec auth state reuse before falling back to username/password login.
- [x] Added MFA/CAPTCHA/access-challenge detection that fails clearly unless manual MFA is explicitly enabled.
- [x] Updated Playwright config to retain traces, screenshots, and videos on failure.
- [x] Implemented active Braze Promotion Code table scanning for native tables and ARIA grids.
- [x] Read `Display Name`, `Remaining`, `Total`, and `Status` columns from Braze voucher tables.
- [x] Filtered table rows to ACTIVE Promotion Code lists.
- [x] Added console output for active voucher rows as display name, remaining vouchers, and total vouchers.
- [x] Added `MIN_CODES_THRESHOLD` configuration.
- [x] Implemented remaining-code parsing and validation, including thousands separators.
- [x] Implemented filtering for ACTIVE Promotion Code lists whose remaining value is below `MIN_CODES_THRESHOLD`.
- [x] Implemented a clear no-op path when no Braze Promotion Code list is below the threshold.
- [x] Added Omio vouchers API base URL selection from `ENV`; QA maps to `https://www.omio.com.qa.goeuro.ninja/vouchers`.
- [x] Added Omio access-token request support for `POST /oauth/token?grant_type=client_credentials`.
- [x] Added editable Omio vouchers bulk job body in `config/vouchers-bulk-job.json`.
- [x] Added validation for Omio vouchers bulk job request bodies, including batch size, template type, money fields, ISO date-time fields, optional arrays, and custom voucher ID rules.
- [x] Added Omio vouchers bulk job creation support for `POST private/v3/jobs/vouchers-bulk`.
- [x] Added Omio vouchers bulk job approval support for `PATCH private/v3/jobs/vouchers-bulk/{jobId}`.
- [x] Added Omio vouchers bulk job status support for `GET private/v3/jobs/vouchers-bulk/{jobId}`.
- [x] Added polling until Omio vouchers bulk jobs reach `COMPLETED`.
- [x] Added Omio vouchers CSV download support for `GET private/v3/jobs/vouchers-bulk/{jobId}/vouchers`.
- [x] Added retry handling for Omio vouchers CSV downloads.
- [x] Added non-empty downloaded-file validation.
- [x] Added support for reading Omio bulk job IDs from the `jobId` response field.
- [x] Added support for using an existing Omio vouchers bulk job through `OMIO_VOUCHERS_BULK_JOB_ID`.
- [x] Implemented Braze CSV upload helper that selects a low ACTIVE Promotion Code list, opens its row, uploads a CSV, starts upload, and clicks update list.
- [x] Added CSV preparation for Braze upload by stripping a leading `voucher_code` header row.
- [x] Added the full manual replenishment flow in `tests/manual/omio-vouchers-bulk.spec.ts`: log in to Braze, find low lists, create/approve/poll/download Omio jobs, and upload one CSV per low Braze list.
- [x] Added manual specs for Braze login, Braze vouchers scanning, Omio auth, and Omio vouchers bulk replenishment.
- [x] Added a shared manual-spec helper so individual live steps can run standalone or as part of the full Braze flow.
- [x] Added mocked Playwright tests for Braze login and direct redirect to the vouchers page.
- [x] Added config tests for environment-specific Braze URL generation, Omio base URL generation, required `ENV`, credentials, and threshold validation.
- [x] Added mocked tests for native table and ARIA grid voucher extraction.
- [x] Added tests for voucher row formatting, count parsing, threshold filtering, and no-match output.
- [x] Added mocked tests for Braze CSV upload to the first low row and to a requested low row.
- [x] Added mocked tests for Omio token auth.
- [x] Added mocked tests for Omio vouchers bulk job URL building, request body loading/validation, creation, approval, status polling, CSV download, retries, and error handling.

## Not Completed Yet

- [ ] Verify the real Braze login flow with valid credentials and `ENV=QA` or `ENV=PROD`.
- [ ] Confirm whether the real Braze account requires MFA/CAPTCHA on every run.
- [ ] Verify the real Braze vouchers page table selectors with valid credentials and `ENV=QA` or `ENV=PROD`.
- [ ] Verify the real Braze upload controls and post-upload success state with valid credentials.
- [ ] Verify the real Omio vouchers bulk create/approve/poll/download flow against the intended QA/PROD endpoint.
- [ ] Add stronger downloaded-file validation beyond non-empty content, such as expected CSV extension, MIME type when available, or CSV shape.
- [ ] Add a generic threshold-rule engine only if multiple metrics/operators are still required. The current code implements the concrete `Remaining < MIN_CODES_THRESHOLD` rule.
- [ ] Implement durable duplicate-upload prevention.
- [ ] Implement scheduler/runtime deployment.
- [ ] Implement alerting on failure.
