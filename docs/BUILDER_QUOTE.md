# Builder quote API (BE-102)

`POST /business/QuoteBuilder` is public, with the existing Redis rate limiter:
10 requests per 60 seconds per route/client IP. No JWT or CAPTCHA is required.
Deploy behind trusted ingress that sanitizes forwarded IP headers.

## Request

```json
{
  "BuildType": "MosquitoNet",
  "Quantity": 1,
  "CustomOptions": {
    "LeftWidthInch": "72",
    "RightWidthInch": "72",
    "LeftLengthInch": "84",
    "RightLengthInch": "84",
    "MosquitoNetYardId": "replace-with-product-id",
    "IncludeBelowCloth": "false",
    "IncludeTopperNet": "false",
    "TopperDirection": "width",
    "TopHeightInch": "3",
    "BelowHeightInch": "8",
    "KuchiStyle": "4side",
    "KuchiCount": "4",
    "KuchiGapInch": "12",
    "FitaId": "replace-with-fita-id",
    "FitaStyle": "2:1",
    "SutarBobinId": "replace-with-thread-id"
  }
}
```

When enabled, below cloth requires `BelowClothId` and alternate topper requires
`TopperNetYardId`. Options use the existing checkout string format, including
literal `"true"` / `"false"`. Quantity is a JSON integer from 1 to 1000.
Other builder types are unsupported. Extra top-level fields (including UnitPrice)
are rejected. The shared checkout parser validates material types, database
prices, heights and all option ranges. Unknown option strings are discarded.

## Response and client handoff (CLIENT-101)

HTTP 200 returns `{ IsSuccess: true, Data: { ... } }`, where Data contains:

- BuildType, Currency (`BDT`), ProductName, Category, SubCategory and ImageLinks.
- UnitPrice (rounded up to whole taka), Quantity, TotalPrice (quantity * unit price).
- CustomOptions: normalized options and authoritative derived fields, matching checkout.
- Breakdown: TotalNetInch, NoOfKuchi, KuchiNetInch, BoundaryNetInch,
  TopperNetInch, BelowClothInch, FitaLengthInch, FitaRolls, SutarBobinCount,
  BoundaryCost, TopperCost, BelowClothCost, FitaCost, SutarBobinCost, LabourCost,
  UnroundedUnitPrice and RoundingAdjustment. Costs are customer-facing BDT
  material charges per net, NOT making/wholesale prices or internal profit.

Breakdown values are per net, not multiplied by Quantity. Shipping and coupons
are excluded and remain calculated at checkout. Formulas are unchanged.

Before adding a custom item, CLIENT-101 should call this endpoint, disable repeat
clicks while pending, show errors, and use the returned price/options/metadata.
Assign a cart ProductId beginning `custom-mosquito-net-`. No quote ID is required:
this is a preview, not a price reservation, stock reservation or signed token.
Requote after configuration changes and do not apply a stale asynchronous response.

Checkout always rereads products and recalculates. Changing quoted fields or
skipping the quote request cannot reduce accepted prices. Changed catalog prices
cause checkout's existing 400 error; requote and obtain the customer's acceptance.
Quotes do not write orders, reserve inventory, or verify CAPTCHA.

Invalid input returns 400; rate limiting returns 429. Database/Redis outages must
be shown as retryable failures, never replaced with an unvalidated local price.

## Permission seeds

Run `node scripts/seed-builder-quote.cjs` against the intended environment.
It uses server environment variables (or local .env), never frontend secrets.
Repeatable upserts cover `featureendpointmaps` and `featurerolemaps` for all five
existing roles, including `annonymous` (the existing spelling).

FeatureRoleMap was absent in the inspected database. Its new schema was approved
by the owner: string _id, FeatureId, FeatureName and RoleName. The endpoint mapping
also includes APIToAccess. Public access is explicitly enforced by the controller's
rate-limit-only guard; these seed records do not require a login or grant access
to any private endpoint. Reapply the seed after a fresh database reset.
