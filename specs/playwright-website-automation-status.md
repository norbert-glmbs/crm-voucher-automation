# Playwright Website Automation Status

Last updated: 2026-06-17

## Completed

- [x] Chose the existing root Playwright project as the implementation location instead of creating a nested `automation/` project.
- [x] Added environment variable documentation for the Braze app usage URL, credentials, auth state path, MFA handling, and login timeouts.
- [x] Added runtime secret and generated-state ignores for `.env`, `.playwright/`, downloads, temp files, artifacts, and run history.
- [x] Added `loadBrazeLoginConfig` to validate required Braze login environment variables and apply safe defaults.
- [x] Implemented `loginToBraze` for the Braze username/password login flow.
- [x] Implemented auth state persistence to `.playwright/.auth/braze.json` by default.
- [x] Added MFA/CAPTCHA/access-challenge detection that fails clearly unless manual MFA is explicitly enabled.
- [x] Added a mocked Playwright test that verifies the login helper fills credentials, reaches the app usage page, and writes browser storage state.
- [x] Added manual real-site login commands through `yarn braze:login` and `yarn braze:login:headed`.
- [x] Updated Playwright config to retain traces, screenshots, and videos on failure for debugging login runs.
- [x] Verified the mocked login test with `yarn test`.
- [x] Added `BRAZE_ENV_ID` configuration so login targets `https://dashboard-01.braze.com/dashboard/app_usage/{envId}?locale=en`.
- [x] Added config tests for environment-specific Braze app usage URL generation and required `BRAZE_ENV_ID` validation.
- [x] Verified the environment-specific login/config tests with `yarn test`.
- [x] Updated the manual Braze login command to reuse an existing saved auth state file before falling back to username/password login.
- [x] Verified the auth-state reuse code compiles cleanly through `yarn test`.
- [x] Added Braze vouchers URL generation for `https://dashboard-01.braze.com/integrations/vouchers/vouchers/{envId}?locale=en`.
- [x] Implemented active voucher table scanning that reads `Display Name`, `Remaining`, `Total`, and `Status` columns.
- [x] Added console output for active voucher rows as `display name, remaining, total`.
- [x] Added `MIN_CODES_THRESHOLD` configuration and filtering for active promotion-code lists whose remaining value is below the threshold.
- [x] Added `yarn braze:vouchers` and `yarn braze:vouchers:headed` manual commands.
- [x] Added mocked Playwright tests for native table and ARIA grid voucher extraction.
- [x] Added `yarn braze:flow` and `yarn braze:flow:headed` to run every live manual Braze spec under `tests/manual`.
- [x] Added a shared manual-spec helper so individual live steps can run standalone or as part of the full Braze flow.

## Not Completed Yet

- [ ] Verify the real Braze login flow with valid credentials and a real `BRAZE_ENV_ID`.
- [ ] Confirm whether the real account requires MFA/CAPTCHA on every run.
- [ ] Verify the real Braze vouchers page table selectors with valid credentials and a real `BRAZE_ENV_ID`.
- [ ] Implement threshold rules.
- [ ] Implement external API file download.
- [ ] Implement file upload through the website UI.
- [ ] Implement durable duplicate-upload prevention.
- [ ] Implement scheduler/runtime deployment.
- [ ] Implement alerting on failure.
