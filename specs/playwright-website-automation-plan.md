# Playwright Website Automation Plan

## Summary

Build a scheduled Playwright automation worker that logs in to a website, reads target numbers from the UI, compares them with configured thresholds, downloads a file from an external API when the threshold rule matches, and uploads that file back through the website UI.

This is needed because the website does not expose an API for reading the numbers or uploading the file. Browser automation should be used only for the website steps that cannot be done through APIs.

## Current Implementation Audit

Last audited against code: 2026-06-22

The implementation now lives in the existing root Playwright project, not in a nested `automation/` directory.

- [x] Load runtime configuration from environment variables and a local `.env` file.
- [x] Select Braze and Omio environments with `ENV=QA` or `ENV=PROD`.
- [x] Log in to Braze with Playwright using shared `LOGIN_USERNAME` and `PASSWORD` credentials.
- [x] Persist and reuse Braze browser auth state at `.playwright/.auth/braze.json` by default.
- [x] Detect MFA, CAPTCHA, or access challenges and fail clearly unless manual MFA is enabled.
- [x] Navigate to the Braze Promotion Codes page.
- [x] Read ACTIVE voucher rows from native tables and ARIA grids.
- [x] Extract `Display Name`, `Remaining`, `Total`, and `Status` values from the voucher table.
- [x] Normalize and validate remaining-code counts before threshold comparison.
- [x] Filter ACTIVE Promotion Code lists below `MIN_CODES_THRESHOLD`.
- [x] Stop without creating Omio jobs when no Braze list is below the threshold.
- [x] Request an Omio access token with client-credentials Basic auth.
- [x] Extract a source Omio vouchers bulk job id from each low Braze Promotion Code display name using the `..._jobId_{jobId}_...` naming convention.
- [x] Skip low Braze Promotion Code lists whose display name does not contain a source Omio vouchers bulk job id.
- [x] Fetch the source Omio vouchers bulk job and derive the new POST body from its `uppercaseIds` and `template`.
- [x] Use `REPLENISH_BATCH_SIZE` as the per-run batch size override for replenishment jobs.
- [x] Use `JOB_ID`, `TARGET_BATCH_SIZE`, and `CAMPAIGN_NAME` to start a new Braze Promotion Code list create flow.
- [x] Open the Braze new Promotion Code List form with the `Create Promotion Code List` button or `/integrations/vouchers/new/{envId}` fallback URL.
- [x] Fill new Braze Promotion Code list `Name` with `{CAMPAIGN_NAME}_jobId_{JOB_ID}` and `Code Snippet Name` with `CAMPAIGN_NAME`.
- [x] Use `TARGET_BATCH_SIZE` as the batch size override for one-off create jobs.
- [x] Split `REPLENISH_BATCH_SIZE` and `TARGET_BATCH_SIZE` values over `100000` into multiple Omio jobs because the backend limit is `100000` vouchers per request.
- [x] Create Omio vouchers bulk jobs through `POST private/v3/jobs/vouchers-bulk`.
- [x] Approve Omio vouchers bulk jobs through `PATCH private/v3/jobs/vouchers-bulk/{jobId}`.
- [x] Poll Omio vouchers bulk job status until `COMPLETED`.
- [x] Download generated Omio vouchers to a CSV file and reject empty downloads.
- [x] Retry voucher CSV downloads for transient "not ready" or API failures.
- [x] Upload downloaded CSVs through the Braze Promotion Code list UI.
- [x] Strip a leading `voucher_code` CSV header before Braze upload.
- [x] Record useful console logs for threshold decisions, Omio job state, downloads, and uploads.
- [x] Retain Playwright screenshots, traces, and videos on failure.
- [x] Cover the core parsing, threshold, Omio API, download, and upload helpers with mocked tests.
- [ ] Verify the real Braze login, table selectors, and upload controls with valid QA/PROD credentials.
- [ ] Verify the real Braze new Promotion Code List button/form selectors with valid QA/PROD credentials.
- [ ] Confirm whether the real Braze account can run unattended without MFA or CAPTCHA.
- [ ] Add durable duplicate-upload prevention or run history.
- [ ] Add production scheduling/deployment.
- [ ] Add operational alerting.

## Recommended Approach

Use a small standalone Node.js and TypeScript project with Playwright.

Core responsibilities:

- Use Playwright to authenticate to the website.
- Navigate to the relevant page.
- Extract the required numbers from stable page elements.
- Compare the extracted values with threshold rules stored in configuration.
- Call the external API directly to download the file.
- Validate the downloaded file before upload.
- Upload the file through the website's upload form using Playwright.
- Confirm the upload completed successfully.
- Record logs, screenshots, and traces for successful and failed runs.

## Proposed Project Structure

The original proposed structure was:

```text
automation/
  src/
    config.ts
    run.ts
    website/
      auth.ts
      readNumbers.ts
      uploadFile.ts
    api/
      downloadFile.ts
    rules/
      thresholds.ts
    storage/
      runHistory.ts
  tests/
    thresholds.test.ts
    readNumbers.spec.ts
    uploadFile.spec.ts
  playwright.config.ts
  package.json
  tsconfig.json
  .env.example
  Dockerfile
```

The implemented root project currently uses:

```text
src/
  config.ts
  api/
    omioAuth.ts
    omioVouchersBulk.ts
  website/
    auth.ts
    vouchers.ts
tests/
  manual/
    braze-login.spec.ts
    braze-vouchers.spec.ts
    omio-auth.spec.ts
    omio-vouchers-bulk.spec.ts
    support/manualFlow.ts
  website/
    auth.spec.ts
    config.spec.ts
    omioAuth.spec.ts
    omioVouchersBulk.spec.ts
    vouchers.spec.ts
config/
playwright.config.ts
package.json
README.md
```

## Workflow

1. Load configuration and secrets from environment variables.
2. Start Playwright with tracing and screenshots enabled for failure cases.
3. Log in to the website or reuse a stored authenticated session.
4. Navigate to the page containing the target numbers.
5. Extract the numbers from the DOM.
6. Normalize and validate the extracted values.
7. Compare the values with configured threshold rules.
8. If no rule matches, log the result and stop.
9. If a rule matches, call the external API and download the file to a temporary path.
10. Validate the file exists, has the expected extension or MIME type, and has a nonzero size.
11. Navigate to the website upload page.
12. Upload the file using Playwright's file upload support.
13. Verify the website shows a successful upload state.
14. Store a run record so the same file is not uploaded twice.

## Configuration

Keep runtime values outside source code.

Expected environment variables:

```text
ENV=
LOGIN_USERNAME=
PASSWORD=
BRAZE_AUTH_STATE_PATH=
BRAZE_LOGIN_ALLOW_MANUAL_MFA=
BRAZE_LOGIN_MFA_TIMEOUT_MS=
BRAZE_LOGIN_NAVIGATION_TIMEOUT_MS=
MIN_CODES_THRESHOLD=
REPLENISH_BATCH_SIZE=
JOB_ID=
TARGET_BATCH_SIZE=
CAMPAIGN_NAME=
```

Do not commit real credentials, cookies, downloaded files, or Playwright auth state. Treat saved browser auth state as sensitive because it can contain cookies and tokens.

The code derives the Braze URLs and Omio vouchers API base URL from `ENV`. Omio access tokens are requested at runtime with the shared credentials; there is no committed API token. For the current local QA setup, `ENV=QA` points the Omio vouchers API client at `http://localhost:8080/vouchers`.

## Threshold Rules

Threshold logic should be deterministic and covered by unit tests. The current implementation uses the single configured threshold `MIN_CODES_THRESHOLD` and filters ACTIVE Braze Promotion Code lists where `Remaining < MIN_CODES_THRESHOLD`.

Example rule shape:

```ts
type ThresholdRule = {
  key: string;
  metricName: string;
  operator: "lessThan" | "greaterThan" | "between" | "outside";
  value?: number;
  min?: number;
  max?: number;
};
```

The worker should fail clearly if a required number cannot be found or cannot be parsed. It should not continue with a default value.

If multiple metrics, operators, or threshold ranges are still required, a generic rule engine like the example above remains future work.

## Website Automation Notes

Prefer stable selectors in this order:

- Accessible labels and roles.
- Table headers plus row labels.
- Stable element IDs or data attributes, if available.
- Text selectors only when the text is stable.
- CSS selectors based on layout only as a last resort.

Capture screenshots and Playwright traces on failure so selector or login issues can be debugged after a scheduled run.

If the site requires CAPTCHA or mandatory MFA for every run, use an approved service account or vendor-supported automation path. Do not attempt to bypass CAPTCHA, MFA, or website access controls.

## Scheduling Options

Recommended production options:

- A small VM or server with `cron`.
- A scheduled Cloud Run job.
- An ECS/Fargate scheduled task.
- Another managed scheduled container job.

Acceptable for simple cases:

- GitHub Actions scheduled workflow, if the website is reachable from GitHub-hosted runners and the credentials can be stored safely in repository or organization secrets.

Browser automation is usually more reliable in a controlled container or VM than in a generic CI runner.

## Reliability Guardrails

Add these before treating the workflow as production-ready:

- Retry transient navigation and API failures with backoff. Omio CSV downloads already retry; broader navigation/API retry policy is still pending.
- Time out each major step. Playwright navigation and table waits already have timeouts.
- Save screenshots and traces on failure. This is configured in `playwright.config.ts`.
- Log the extracted numbers and threshold decision. This is implemented through console output.
- Store a file checksum, API file ID, or run key to prevent duplicate uploads. This remains pending.
- Send alerts on failure through email, Slack, or another operational channel.
- Keep downloaded files in a temporary directory and clean them up after upload.

## Testing Plan

Use unit tests for:

- Threshold comparisons. Implemented for `Remaining < MIN_CODES_THRESHOLD`.
- Number parsing and normalization. Implemented for voucher count parsing.
- Duplicate-upload detection. Pending because durable run history is not implemented.

Use Playwright tests for:

- Reading numbers from a representative page. Implemented with mocked native table and ARIA grid pages.
- Uploading a local fixture file. Implemented with mocked Braze upload pages.
- Handling login/session reuse. Login and auth-state writing are covered with mocked tests; real session reuse still needs live verification.

If the real website cannot be safely tested in CI, create a small mocked HTML page or local test app that mimics the required DOM and upload flow.

## Where Codex Fits

Codex can build, maintain, and debug this automation project. A Codex skill can also be added later to document the website-specific workflow for future sessions.

The skill should contain:

- Which selectors matter and how to update them.
- How to run the worker locally.
- How to run the tests.
- How to inspect failed Playwright traces.
- The operational rules for credentials and duplicate uploads.

The skill should not be the production scheduler. The production scheduler should run the automation code directly.

## Inputs Needed For Production Readiness

- Confirmation that the real Braze account can run unattended, or an approved manual/service-account path if MFA or CAPTCHA appears every run.
- Confirmation that the real Braze vouchers table selectors match the mocked native table or ARIA grid assumptions.
- Confirmation that the real Braze upload controls and success indicator match the implemented upload flow.
- Decision on whether the single `MIN_CODES_THRESHOLD` rule is sufficient, or whether generic multi-metric threshold rules are still required.
- Preferred runtime: local machine, server cron, GitHub Actions, or cloud scheduled job.
- Alerting destination for failures.
- Durable duplicate-upload key, such as file checksum, Omio job ID, Braze list name, or another run-history identifier.

## Open Risks

- Website UI changes may break selectors.
- Session expiration may require login handling updates.
- CAPTCHA or mandatory MFA may prevent unattended automation.
- The website may block automated browser sessions.
- Scheduled runs may upload duplicates unless the workflow stores idempotency state.
- CI-hosted runners may not have network access to the website.
