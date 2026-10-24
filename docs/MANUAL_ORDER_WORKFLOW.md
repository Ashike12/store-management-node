# Manual order placement: final BE-105 decision

Confirmed by the owner on 2026-10-24. Customers place an order with a mandatory
Bangladesh mobile number. There is no online payment, payment-method choice,
wallet integration, merchant configuration, PIN or OTP collection at checkout.

## Customer experience

Before submission and on the confirmation receipt, explain:

> A salesperson will call to confirm your order. The delivery charge may be
> requested in advance; products may be paid for by cash on delivery. No online
> payment is collected here.

The receipt shows the order reference, contact phone, server-calculated total and
callback instructions. It stays on the checkout screen after cart clearing until
the customer chooses to continue shopping. It is not a payment receipt. Receipt
state is not a persisted order-history page and does not survive a page reload.

Existing shipping rates, server-side price validation, CAPTCHA and request-ID
deduplication remain in force. Payment or delivery arrangements are agreed
offline by the salesperson; placing an order does not reserve stock or mark it paid.

## Backend contract

- PhoneNumber must be a valid Bangladesh mobile format: `01[3-9]` followed by eight
  digits. `+880` / `880` prefixes, spaces and hyphens are accepted and normalized
  to the local eleven-digit form. Format validation does not prove ownership.
- New orders are always pending, with PaymentHandling=`manual`,
  PaymentStatus=`unpaid`, and RequiresImmediateAction=`true`. Client-supplied
  payment/priority flags cannot override these server values.
- CreateClientOrder and an identical retry return PaymentHandling=`manual` and
  ContactRequired, alongside the existing order ID/reference/total. Equivalent
  phone formatting does not produce a different server retry hash.
- ListOrders accepts optional boolean NeedsAction, filtering the persisted
  RequiresImmediateAction flag. Existing JWT and explicit admin restrictions apply.
- Successful confirmation/cancellation clears the flag in the same transaction
  as the order transition. Failed confirmation leaves the flag and stock unchanged.
- Confirmation, shipping and delivery never imply paid. There is no payment
  mutation API introduced by this decision. The follow-up note can record the
  conversation; it is not a verified financial ledger entry.

## Admin experience

Admins receive a prominent header follow-up count, refreshed every 30 seconds.
The follow-up dialog shows pending orders, customer phone/click-to-call, delivery
details and totals. Reviewing an order permits confirmation or cancellation with
an optional note. Confirmation still requires sufficient stock and the current
order version. Errors require reload/review rather than pretending success.
Other roles never mount this follow-up UI; the server also denies their access.

This is an in-portal follow-up queue, not an SMS, email or push notification.
Notification delivery while the portal is closed is not implemented.

## Deployment and scope

Depends on the existing BE-103/104 order endpoints and their permission seeds.
No new endpoint or role access is added here, so no additional FeatureEndpointMap
or FeatureRoleMap records are needed. Deploy the backend field/filter changes
with the admin/client changes. No gateway or merchant secrets are needed.

Applies to new MVP orders; no backfill of older orders is performed. A full order
management screen remains ADMIN-102. This follow-up dialog is not that full console.
Gateway plans in earlier documents are superseded by this manual workflow.

## Verification

Automated tests mock checkout/CAPTCHA and frontend requests. Backend tests cover
phone requirements, normalized retries, ignored forged payment flags and boolean
filters. The isolated local MongoDB replica-set test verifies queue filtering,
successful clearing, and preservation on insufficient stock. No live order or
payment is submitted during these tests. The client checkout/phone suite passes
38 focused tests (41 across the full client suite); the localized admin
follow-up UI/API suite passes 25 tests.
