# Invoice consistency and access contract

BE-106 makes the existing invoice endpoints consistent across the `Product`,
`ProductSell`, and `Invoice` collections. It does not add or rename an API.

## Mutation rules

- Only an authenticated admin may create, update, or delete an invoice.
- Every mutation runs in one MongoDB transaction. Stock changes, product-sale
  rows, and the invoice either all commit or all roll back.
- Stock deduction uses a conditional atomic update. Concurrent invoices cannot
  reduce a product below zero.
- Editing restores the previous product quantities before applying the new
  lines in the same transaction.
- Deleting restores product quantities and removes the related sale rows.
- A due-payment invoice must have a wholesaler, a positive payment, and no
  product lines. It never changes stock.
- A wholesale or due-payment owner must be an active wholesaler account. A
  consumer invoice cannot carry a wholesaler ID.
- Payment cannot exceed a product invoice total. Numeric inputs must be finite
  and remain within the shared order safety limits.
- Repeated product IDs are allowed as separate invoice lines, but inventory is
  aggregated per product before the atomic deduction.

## Dashboard rules

- Outstanding due is the sum of product invoice totals minus payments, minus
  due-payment receipts.
- Creating, editing, converting, or deleting invoices therefore changes the due
  total from the committed invoice state without a second statistics table.
- `ThisMonthTotalInvoice`, revenue, and sold quantity exclude records whose
  `CreatedDate` is outside the current month.
- BE-107 still owns the business decision about whether recovered due should be
  described as revenue or profit. BE-106 deliberately preserves that existing
  reporting formula.

## Read access

- Admin users can read all invoices, details, dashboard sections, profit, and
  cost-derived values.
- A wholesaler-only user is always scoped to their own `WholeSalerId`, even if a
  different wholesaler ID or invoice ID is submitted.
- Wholesaler responses omit `ProfitMargin`, aggregate sales/revenue sections,
  and other private business reporting. Product-sale detail rows are scoped by
  both invoice and wholesaler owner.
- A user carrying both admin and wholesaler roles is treated as an admin.
- Customer, app-user, anonymous, missing-user, and other roles are rejected in
  the controller and again in the service.

## Database constraints

- Invoice numbers are collision-resistant and uniquely indexed.
- Invoice owner/date and product-sale invoice/owner/date lookup paths are
  indexed.
- Invoice and product-sale schemas enforce required types, invoice enums, and
  non-negative amount constraints for writes outside controller DTOs.

These indexes target the pre-launch schema. Existing disposable test data may be
cleared if it violates the new constraints; no legacy-data migration is needed.

## Verification

The integration suite uses an isolated local MongoDB replica set and never reads
`.env`, Atlas, Redis, or production data. It covers successful create/edit/delete,
failure rollback, due-payment lifecycle, product/due conversion, owner ACL
changes, concurrent oversell prevention, duplicate product rows, unique invoice
numbers, monthly dashboards, and cross-wholesaler privacy.

No new `FeatureEndpointMap` or `FeatureRoleMap` seed is required because all
authorization changes apply to existing invoice routes.
