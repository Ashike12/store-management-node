# Due-payment reporting policy

BE-107 separates product profitability from cash collection timing.

## Stored invoice values

For a product invoice:

- `ProductCostAmount = sum(snapshot MakingPrice * Quantity)`
- `GrossProfit = TotalAmount - ProductCostAmount`
- `RealizedCashMargin = PaymentAmount - ProductCostAmount`

For a due-payment receipt:

- `ProductCostAmount = 0`
- `GrossProfit = 0`
- `RealizedCashMargin = PaymentAmount`

Product-sale rows also snapshot `MakingPrice`; later product price changes cannot rewrite historical reporting.

## Aggregate values

- `CashCollected` is the sum of every invoice and due-receipt payment.
- `OutstandingDue = max(TotalBilled - CashCollected, 0)`.
- `CustomerCredit = max(CashCollected - TotalBilled, 0)`.
- `CostAtRisk = max(ProductCostAmount - CashCollected, 0)`.
- `TotalBilled`, product cost and gross profit exclude due-payment receipts.

Realized cash margin can be negative while collected cash has not recovered product cost. Once all payments are collected, cumulative realized cash margin equals gross profit.

## Access and compatibility

- Admin invoice and dashboard responses expose the explicit financial fields.
- Wholesaler responses include billing, collected cash, outstanding due and account credit only. Cost and margin fields remain private.
- The old `ProfitMargin`, `ThisMonthRevenue` and `SalesData` names are removed because they mixed sales profitability with cash recovery.
- The existing invoice and dashboard endpoints are reused. `FeatureEndpointMap` and `FeatureRoleMap` require no new seed records.
- This MVP intentionally requires fresh invoice data; no historical `ProfitMargin` migration is provided.
