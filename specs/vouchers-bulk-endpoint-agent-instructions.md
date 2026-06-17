# Agent Instructions: Creating Voucher Bulk Jobs

## Purpose

Use these instructions when a user asks an agent to make, prepare, debug, or explain a `POST` request to:

```text
/vouchers/private/v3/jobs/vouchers-bulk
```

The agent does not need to know any UI application that may call this endpoint. Treat this as a backend API request for creating a bulk voucher job.

## Endpoint Meaning

This endpoint creates a voucher bulk job. The request body is a JSON object with top-level job fields and a nested `template` object. The `template` is the voucher template that will be used by the job to create one or more vouchers.

Use `Content-Type: application/json`.

The caller must also have valid authentication/authorization for this private endpoint. Do not invent credentials or tokens.

## Request Shape

Base shape:

```json
{
  "batchSize": 1,
  "uppercaseIds": false,
  "template": {}
}
```

Top-level fields:

- `batchSize`: required integer. Current backend bounds are `1` to `100000`.
- `uppercaseIds`: required boolean. Use `false` unless the user explicitly wants generated voucher IDs uppercased.
- `template`: required object. This cannot be null.
- `publisherName`: optional string.
- `publisherEmailDetails`: optional object.
- `ruleName`: optional string.

## Common Template Fields

Every voucher template should include:

- `campaignName`: required non-empty string.
- `type`: required voucher type. Use `"RELATIVE"` for percentage discounts or `"FIXED"` for fixed-amount discounts.
- `expiresAt`: required ISO date-time string, for example `"2026-07-01T00:00:00Z"`.
- `currency`: required ISO currency code, for example `"EUR"`.

Recommended fields to include even when not strictly backend-required:

- `maximumRedemption`: integer. Usually `1` for single-use codes or a higher number for reusable codes.
- `category`: string, commonly `"GENERIC"` unless the user specifies another category.
- `visibility`: string, commonly `"PRIVATE"` unless the user specifies public vouchers.
- `allowedBookingDomains`: array, usually `["TRAVEL"]` or `["ACCOMMODATION"]`.
- `allowedRedemptionPlatforms`: array, usually `["ALL"]`, `["WEB"]`, or `["APP"]` for travel vouchers.

## Type-Specific Template Fields

### Relative Voucher

Use this when the user asks for a percentage discount.

Mandatory fields:

- `percentageReduction`: required positive integer. Do not use decimals.
- `maxPrice`: required positive integer in minor currency units.

Example:

```json
{
  "type": "RELATIVE",
  "percentageReduction": 10,
  "maxPrice": 5000
}
```

Interpretation:

- `percentageReduction: 10` means 10%.
- `maxPrice: 5000` means 50.00 in the selected currency, for example 50.00 EUR.

### Fixed Voucher

Use this when the user asks for a fixed-amount discount.

Mandatory fields:

- `flatReduction`: required positive integer in minor currency units.
- `minPrice`: required positive integer in minor currency units.

Validation rule:

- If `minPrice` is set, `flatReduction` must not be greater than `minPrice`.

Example:

```json
{
  "type": "FIXED",
  "flatReduction": 1000,
  "minPrice": 2000
}
```

Interpretation:

- `flatReduction: 1000` means 10.00 in the selected currency, for example 10.00 EUR.
- `minPrice: 2000` means 20.00 in the selected currency, for example 20.00 EUR.

## Money Units

All monetary fields must be sent as integers in minor currency units:

- `1000` means `10.00`.
- `5000` means `50.00`.
- `1200` means `12.00`.

Apply this to:

- `flatReduction`
- `minPrice`
- `maxPrice`
- `minPayment`
- `maxReduction`

Do not send `"10 EUR"`, `10.00`, or `"10.00"` for money fields.

## Optional Template Fields

Include these only when requested or clearly needed:

- `voucherId`: optional custom voucher code. Only use when creating a single voucher, meaning `batchSize` is `1`.
- `availableFrom`: optional ISO date-time string.
- `maximumRedemptionPerUser`: optional positive integer.
- `ruleId`: optional UUID.
- `includedCountries`: optional array of ISO alpha-2 country codes.
- `excludedCountries`: optional array of ISO alpha-2 country codes.
- `providers`: optional array of provider identifiers.
- `carriers`: optional array of carrier identifiers.
- `providerReservationType`: optional string, for provider vouchers.
- `cardTitleKey`, `cardDescriptionKey`, `bottomSheetTitleKey`, `bottomSheetDescriptionKey`: optional translation keys.
- `conditions`: optional voucher conditions object.

Do not send empty arrays or empty condition arrays unless the API explicitly requires them. Prefer omitting optional fields when empty.

## Example Relative Request

```json
{
  "batchSize": 1,
  "uppercaseIds": false,
  "template": {
    "campaignName": "20260617_cs_all_promotional_10_eur_relative_unique",
    "type": "RELATIVE",
    "expiresAt": "2026-07-01T00:00:00Z",
    "maximumRedemption": 1,
    "percentageReduction": 10,
    "currency": "EUR",
    "maxPrice": 5000,
    "visibility": "PRIVATE",
    "category": "GENERIC",
    "allowedBookingDomains": ["TRAVEL"],
    "allowedRedemptionPlatforms": ["ALL"]
  }
}
```

## Example Fixed Request

```json
{
  "batchSize": 100,
  "uppercaseIds": true,
  "template": {
    "campaignName": "20260617_cs_all_promotional_10_eur_fixed_bulk",
    "type": "FIXED",
    "expiresAt": "2026-07-01T00:00:00Z",
    "maximumRedemption": 1,
    "flatReduction": 1000,
    "minPrice": 2000,
    "currency": "EUR",
    "visibility": "PRIVATE",
    "category": "GENERIC",
    "allowedBookingDomains": ["TRAVEL"],
    "allowedRedemptionPlatforms": ["ALL"]
  }
}
```

## How To Interpret User Requests

If the user says "percentage", "%", "relative", or "10% off", use `type: "RELATIVE"`.

If the user says "fixed", "absolute", "10 EUR off", or "discount amount", use `type: "FIXED"`.

If the user gives money in major units, convert it to minor units before sending:

- User says `10 EUR` -> send `1000`.
- User says `50 EUR max price` -> send `5000`.

If the user gives a percentage with decimals, ask for an integer percentage because the backend DTO expects an integer.

If the user asks for multiple generated voucher codes, set `batchSize` to that number and do not set `voucherId` unless the API behavior is explicitly confirmed.

If the user asks for one specific voucher code, set `batchSize` to `1` and set `template.voucherId` to that code.

If the user does not provide `expiresAt`, ask for it. Do not guess an expiration date for a real request.

If the user does not provide `currency`, ask for it. Do not guess currency for a real request.

If the user does not provide the minimum fields for the selected voucher type, ask for the missing values.

## Validation Checklist Before Sending

Before making the POST request, verify:

- `batchSize` is an integer from `1` to `100000`.
- `uppercaseIds` is boolean.
- `template` is present.
- `template.campaignName` is non-empty.
- `template.type` is either `"RELATIVE"` or `"FIXED"`.
- `template.expiresAt` is present and is an ISO date-time string.
- `template.currency` is a valid ISO currency code.
- For `RELATIVE`, `percentageReduction` is a positive integer and `maxPrice` is a positive integer.
- For `FIXED`, `flatReduction` and `minPrice` are positive integers, and `flatReduction <= minPrice`.
- Money fields are integers in minor currency units.
- Optional arrays are omitted if empty.
- Credentials or auth tokens are provided through a secure mechanism, not hardcoded.

## Curl Template

```bash
curl -X POST "$BASE_URL/vouchers/private/v3/jobs/vouchers-bulk" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "batchSize": 1,
    "uppercaseIds": false,
    "template": {
      "campaignName": "example_campaign",
      "type": "RELATIVE",
      "expiresAt": "2026-07-01T00:00:00Z",
      "maximumRedemption": 1,
      "percentageReduction": 10,
      "currency": "EUR",
      "maxPrice": 5000,
      "visibility": "PRIVATE",
      "category": "GENERIC",
      "allowedBookingDomains": ["TRAVEL"],
      "allowedRedemptionPlatforms": ["ALL"]
    }
  }'
```

## Safety Rules

- Do not invent campaign details, dates, voucher amounts, currencies, or thresholds for a real request.
- Do not paste or persist secrets in source files.
- Do not retry a POST blindly if it may create duplicate jobs. Check whether the previous request succeeded first.
- Do not call the endpoint in production unless the user explicitly confirms the payload and environment.
- For dry runs or examples, clearly label the request as an example and do not send it.
