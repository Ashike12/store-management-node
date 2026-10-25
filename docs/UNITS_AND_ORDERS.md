# Units and order operations

## BE-103: mosquito-net-v1

Owner decisions confirmed 2026-10-23. The pure calculator is
`src/business/calculations/mosquito-net.ts`; quote and checkout call it after
validating the inputs and loading product prices. Orders and custom options record
`FormulaVersion: mosquito-net-v1`. No old records are converted.

- Product NetHeight is a decimal string in **feet**; NetHeightUnit is `feet`.
  The admin input now labels feet. A stored height of 5 means 60 inches.
- Builder dimensions and trim heights are inches. Preview height uses the
  selected main net height times 12, not the sum of trim heights.
- TotalNet = LW + RW + LL + RL. Four-side kuchi count is count * 8;
  gap style count is floor(TotalNet / gap) + 1. KuchiNet = count * 2.
- Boundary = TotalNet + KuchiNet. Topper = ceil(minimum side / main fabric
  height in inches) * opposite maximum side. Width operation uses maximum
  length; length operation uses maximum width. **Alternate topper still uses
  the main fabric height**, but the alternate fabric's price.
- Below cloth = Boundary / max(floor(30 / (2 * top trim + bottom trim)), 1)
  when selected; otherwise zero. This preserves the existing strip rule.
- Fita inches = perimeter + first ratio * max width + second ratio * max length.
  One roll is 12 yards = 432 inches. Charge ceil(length / 432) whole rolls.
  Thread is one unit per net; labour is Tk 200 per net.
- Fabric prices are per yard (36 inches). All amounts are BDT. Custom unit
  prices are rounded up once to a whole taka after summing material charges
  and labour. The fixture tests cover 432/433/864-inch Fita and the 540-inch case.

## BE-104: public checkout and stock timing

CreateClientOrder now requires a UUID-v4 `RequestId`. The client persists a
request ID and a digest of the payload in session storage, excludes CAPTCHA from
that identity, and reuses it on retries. It does not store the address in this
retry record. A changed payload receives a new ID. A successful order clears it.

The database unique RequestId index prevents duplicate pending orders in a race.
The server also hashes the submitted payload (excluding token and request ID).
Same ID + same payload returns the original order summary; same ID + different
payload returns 409. CAPTCHA is still required on retries. Never reuse a request
ID for a different intended purchase. Distinct IDs represent distinct orders.

**Placing a pending order does not reserve or deduct stock.** All stock is
deducted at admin confirmation in one MongoDB transaction. Concurrent pending
orders may exceed stock; only confirmations with sufficient stock succeed.

- Catalog quantities consume the sold product's Quantity.
- Custom nets consume main/topper/cloth in yards, Fita in whole rolls, and
  thread in units. Server-generated material requirements are frozen at checkout,
  multiplied by ordered quantity and stored on each item. No client inventory
  requirement or formula field is trusted.
- Confirmation aggregates duplicate material IDs and rounds fabric consumption
  upward to six decimal yards once per material. Conditional `$inc` operations
  require sufficient stock; any failure rolls back every material and the order.
- Cancellation before confirmation changes no stock. Cancellation after
  confirmation restores exactly the recorded stock movements once.
- A Mongo replica set or sharded deployment supporting transactions is required.
  There is no unsafe non-transactional fallback.

## Admin API contract (ADMIN-102 handoff)

All routes require a valid JWT, permission mapping, and explicit admin role.
Wholesalers, customers and other non-admin roles cannot list, read or mutate orders.

`POST /business/ListOrders`

```json
{ "Page": 1, "Size": 10, "Status": "pending", "Search": "buyer", "From": "2026-10-01T00:00:00Z", "To": "2026-10-31T23:59:59Z" }
```

All fields are optional. Defaults: page 1, size 10; maximum size 100, page 1000000.
Search is a literal case-insensitive match on customer name, phone or order
number. Dates are inclusive ISO timestamp bounds. Returns IsSuccess, Data and
TotalCount, sorted by creation date and ID descending.

`POST /business/GetOrder`: `{ "ItemId": "order-id" }` returns `{ IsSuccess, Data }`
including delivery fields, items/options, totals, FormulaVersion, PaymentStatus,
OrderStatus, Version, inventory movements and AuditHistory. Request digest,
request ID, customer IP and CAPTCHA metadata are not returned.

`POST /business/TransitionOrder`

```json
{ "ItemId": "order-id", "Status": "confirmed", "ExpectedVersion": 0, "Note": "Stock checked" }
```

Allowed flow: pending -> confirmed -> processing -> shipped -> delivered.
pending, confirmed and processing can move to cancelled. Cancellation after
shipping and backward/skipped transitions are rejected. Version increments on
each transition; stale mutations return 409. Repeating the already-applied status
is a no-op, including repeated confirmation/cancellation. AuditHistory records
actor, timestamp, old/new status and optional note (up to 1000 characters).
No delete/edit-audit endpoint exists. Returns the current order detail.

PaymentStatus starts `unpaid` and never changes with fulfillment. Payment
settlement/refunds are BE-105, not an implied result of confirmation or delivery.
The admin order-management UI remains ADMIN-102 and is not implemented here.

## Deployment and verification

Run `node scripts/seed-order-operations.cjs` against the intended database before
accepting checkout traffic. This repeatably inserts admin-only records for all
three APIs into FeatureEndpointMap and FeatureRoleMap and creates the request-ID
and listing indexes. It was applied and replayed against the configured database.
Existing records without RequestId are excluded from the unique index; existing
orders without inventory snapshots cannot be confirmed. Use fresh MVP data.

Deploy the client RequestId change with the backend requirement. Older clients
without RequestId receive 400. No credentials or production builds are needed
for the automated tests. No order/product data was modified in the hosted database.

Real transaction tests use an isolated local replica set. On Windows with MongoDB
installed, run:

```powershell
$env:MONGOMS_SYSTEM_BINARY = (Get-Command mongod).Source
$env:MONGOMS_VERSION = '7.0.11' # match your installed binary
npm run test:integration
```

Without a system binary, the test helper downloads one into its cache. The
core-only dev dependency avoids downloads during ordinary npm install. Tests
create their own ephemeral database/server and shut them down afterward; they
never read .env or connect to Atlas/Redis.

Remaining scope: BE-106 invoice stock consistency and arbitrary admin inventory
replacement are separate paths, not covered by the confirmation transaction.
Do not claim system-wide inventory consistency across those paths until BE-106
is completed. This change verifies concurrent order confirmations and retries.
