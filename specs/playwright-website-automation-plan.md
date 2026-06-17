# Playwright Website Automation Plan

## Summary

Build a scheduled Playwright automation worker that logs in to a website, reads target numbers from the UI, compares them with configured thresholds, downloads a file from an external API when the threshold rule matches, and uploads that file back through the website UI.

This is needed because the website does not expose an API for reading the numbers or uploading the file. Browser automation should be used only for the website steps that cannot be done through APIs.

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
WEBSITE_BASE_URL=
WEBSITE_USERNAME=
WEBSITE_PASSWORD=
WEBSITE_AUTH_STATE_PATH=
EXTERNAL_API_BASE_URL=
EXTERNAL_API_TOKEN=
THRESHOLD_MIN=
THRESHOLD_MAX=
RUN_HISTORY_PATH=
```

Do not commit real credentials, cookies, downloaded files, or Playwright auth state. Treat saved browser auth state as sensitive because it can contain cookies and tokens.

## Threshold Rules

Threshold logic should be deterministic and covered by unit tests.

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

- Retry transient navigation and API failures with backoff.
- Time out each major step.
- Save screenshots and traces on failure.
- Log the extracted numbers and threshold decision.
- Store a file checksum, API file ID, or run key to prevent duplicate uploads.
- Send alerts on failure through email, Slack, or another operational channel.
- Keep downloaded files in a temporary directory and clean them up after upload.

## Testing Plan

Use unit tests for:

- Threshold comparisons.
- Number parsing and normalization.
- Duplicate-upload detection.

Use Playwright tests for:

- Reading numbers from a representative page.
- Uploading a local fixture file.
- Handling login/session reuse.

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

## Inputs Needed Before Implementation

- Website URL.
- Login method and whether MFA or CAPTCHA appears.
- Exact page containing the numbers.
- Exact numbers to read and threshold rules.
- External API endpoint and authentication method.
- File type expected from the API.
- Website upload page and success indicator.
- Preferred runtime: local machine, server cron, GitHub Actions, or cloud scheduled job.
- Alerting destination for failures.

## Open Risks

- Website UI changes may break selectors.
- Session expiration may require login handling updates.
- CAPTCHA or mandatory MFA may prevent unattended automation.
- The website may block automated browser sessions.
- Scheduled runs may upload duplicates unless the workflow stores idempotency state.
- CI-hosted runners may not have network access to the website.
