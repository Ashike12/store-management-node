# Inventory batches and item serials

BE-110 keeps catalog products, stock intake batches and physical inventory item identities separate.

## Intake rules

- `CreateProduct` requires a client-generated `RequestId`. Quantity may be zero; a positive whole-number quantity creates the initial batch and one item record per unit.
- `AddProduction` requires a `RequestId` and treats every `Quantity` as the amount being added, not the resulting catalog total.
- Intake quantities are whole numbers from 1 through 10,000. Existing sales and custom-material consumption may remain fractional; batch allocation for outgoing stock is intentionally deferred until FIFO/manual allocation is selected.
- Product edits cannot change `Quantity`. Products with batch history cannot be deleted.
- Replaying the same request and payload is idempotent. Reusing a request ID with different data returns a conflict.

## Identity and atomicity

- Batch IDs use `BAT` plus a random UUID without separators.
- Item serials use `BatchId_UniqueId`.
- MongoDB globally unique indexes protect batch IDs and serials. A transaction creates the batch, all item records and the product total together, so partial intake is rolled back.
- `RequestId + ProductId` is unique for production batches. Product creation request IDs are also unique.

## Access

- `POST /business/ListProductBatches` accepts `{ ProductId, Page, Size }`.
- `POST /business/ListBatchItems` accepts `{ BatchId, Page, Size }`.
- Both endpoints are admin-only in the controller, service and permission maps.
- Public product, order and invoice responses do not query or project inventory item records. Serial values are never embedded in public product data or URLs.

## Deployment

Run `npm run seed:inventory` once per environment after deploying. The replay-safe seed creates the two admin permission-map entries and required unique indexes. It does not create or alter inventory data.

Because this is an MVP and historical stock has no item identity, no synthetic migration is provided. Reset stock data or re-enter opening inventory through product creation/intake so every managed unit has a truthful batch and serial.
