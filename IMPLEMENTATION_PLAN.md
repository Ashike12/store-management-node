# Backend implementation plan

Repository: store-management-node. Owns authentication, business data, pricing validation, invoices and orders.

Companions: [Admin](../store-management/IMPLEMENTATION_PLAN.md), [Client](../store-management-client/IMPLEMENTATION_PLAN.md).

## How to use this plan

Snapshot: 2026-10-23. IMPLEMENTED means present in inspected source, not a claim of production verification. PARTIAL means code exists but the requirement has gaps. TODO is proposed work; DECISION needs business input. Historical chat requests are recorded separately from verified behavior.

Add future requests in the template at the end. Give each request a stable ID and acceptance criteria. When implementing, read this plan and the linked companion plans, inspect current code, update affected contracts together, record tests and mark complete only after verification. Do not implement every TODO merely because this document exists.

Do not run npm run build or other production builds unless explicitly requested. Never put real credentials in these documents or commit .env files. Check the active branch and working tree before editing; preserve unrelated changes. Do not automatically commit, push, merge, or deploy from a roadmap request.

## Required API permission seed updates

Every new API implementation must include corresponding FeatureEndpointMap and FeatureRoleMap seed records, not just controller/service code. Update affected mappings when an endpoint is renamed or its allowed roles change. Frontend feature delivery that introduces an API includes this backend task.

- Register the endpoint and intended feature/role permissions in both collections using their actual database schema. Reuse valid existing mappings rather than inserting duplicates; make seeds repeatable and runnable after a fresh database reset.
- Verify authorized roles can call the endpoint and unauthorized roles cannot. Preserve own-record restrictions for employees and wholesalers; a feature permission does not grant access to another user's data.
- Explicitly document public endpoint access; do not accidentally require login for public storefront APIs or grant private APIs public access.
- Include seed application and permission checks in acceptance criteria. Do not mark a new API complete while its required permission data is missing, or bypass validation to avoid adding seed data.
- Source note: src/auth/jwt.strategy.ts currently queries FeatureEndpointMap. On 2026-10-23, database inspection confirmed FeatureRoleMap was absent. With owner approval BE-102 establishes its schema and repeatable seed in scripts/seed-builder-quote.cjs; see docs/BUILDER_QUOTE.md. These public-endpoint records do not alter private endpoint permissions.

## MVP data policy

This is a pre-launch MVP with no client deployments. Existing database records are disposable test data. Do not plan legacy-data migration, backfills, or backward compatibility solely to preserve those records. Prefer a consistent new schema and fresh test/seed data across all three repos.

The owner may reset the database when needed. This planning update does not authorize or perform a database deletion; identify the target database and obtain explicit reset instructions before any destructive operation. Continue to enforce permissions, unique serials, correct calculations and financial records for newly created data. Future operational edit/delete rules still matter. This policy does not remove the need to rotate exposed credentials.

## Architecture and source map

Package declarations: NestJS 11.1.24, TypeScript 5.9.3, Mongoose 9.6.2; Node engine >=20 <25. These are repository declarations, not a latest-version recommendation.

| Area | Main source |
|---|---|
| Startup, configuration | src/main.ts, src/bootstrap-app.ts, src/app.module.ts, src/build-mongo-uri.ts |
| Auth, JWT and password setup | src/auth/auth.controller.ts, src/auth/auth.service.ts, src/auth/jwt.strategy.ts |
| User/profile/password operations | src/user/user.controller.ts, src/user/user.service.ts, src/user/dto/ |
| Products and production | src/business/services/product.service.ts, src/business/dto/product/ |
| Invoices, due payments, dashboards | src/business/services/invoice.service.ts, src/business/dto/product-sell/ |
| Customer orders and custom pricing | src/business/services/client-order.service.ts, src/business/dto/client-order/ |
| AI descriptions | src/business/services/ai-suggestion.service.ts |
| Persistence | src/shared/schemas/ |
| Roles, invoice types, categories | src/shared/constant/ |
| Supporting infrastructure | src/services/redis-helper.service.ts, src/storage/, src/guards/rate-limit.guard.ts |

## Existing implementation

| ID | Status | Feature and boundaries |
|---|---|---|
| BE-001 | IMPLEMENTED | JWT authentication, user management, password setup/change and profile services. Verify authorization with role-specific tests before extending. |
| BE-002 | IMPLEMENTED | Product CRUD, production increments, search, category/subcategory and making-price filters with pagination. |
| BE-003 | IMPLEMENTED | Product fields: ProductName, Category, SubCategory, NetHeight, Description, ImageLinks[], optional VideoLink, MakingPrice, WholeSalerPrice, EndUserPrice, EndUserDiscountedPrice, Quantity. Legacy image/price mapping exists. |
| BE-004 | IMPLEMENTED | Separate public product response excludes MakingPrice and WholeSalerPrice. |
| BE-005 | IMPLEMENTED | Product and empty-product due-payment invoices; sales snapshots retain actual negotiated SellingPrice. |
| BE-006 | IMPLEMENTED | Wholesaler invoice scoping and dashboard branch; profit omitted by response sanitization. Needs regression coverage for cross-wholesaler access. |
| BE-007 | IMPLEMENTED | Due-payment normalization uses PaymentAmount for TotalAmount and ProfitMargin, per prior business request. Accounting interpretation remains a decision below. |
| BE-008 | IMPLEMENTED | Public order creation, CAPTCHA verification, shipping, coupons, persisted order snapshots and pending status. |
| BE-009 | PARTIAL | Custom mosquito-net recalculation at order submission from MongoDB prices; no cart-validation endpoint exists. Security gaps listed below. |
| BE-010 | IMPLEMENTED | Gemini description service with Bengali instruction and failure handling; provider availability still external. |
| BE-011 | IMPLEMENTED | Mongo URI composition and separated bootstrap for deployment. Verify deployed environment separately; never document secret values. |
| BE-012 | DECISION | bKash/Nagad/Rocket discussed; no gateway selected or integrated. |

## API map

Business routes are POST under /business (deployment may add a base prefix).

| Routes | Audience/use |
|---|---|
| GetProducts, CreateProduct, UpdateProduct, DeleteProduct, AddProduction | Authenticated admin operations; wholesaler-only accounts blocked |
| GetClientProducts | Public catalog, rate-limit guard |
| CreateClientOrder | Public order submission, rate-limit guard and service CAPTCHA check |
| CreateInvoice, UpdateInvoice, DeleteInvoice | Authenticated mutation operations |
| GetInvoice, GetDashboardData | Authenticated; service scopes wholesaler data |
| GenerateAiSuggestion | Authenticated description generation |

Auth and user routes remain defined in their controllers. Preserve existing casing and request/response contracts when adding features.

## Current builder calculation contract

Frontend mirror: client src/pages/BuildYourOwn.tsx. Backend authority currently runs during CreateClientOrder.

- LW, RW, LL, RL and cloth heights are inches.
- Yard product NetHeight is feet; heightInInch = NetHeight * 12. BE-103 updates the admin label and explicit API unit to feet.
- TotalNet = LW + RW + LL + RL.
- NoOfKuchi = count * 8 for 4side; otherwise floor(TotalNet / gap) + 1. The owner confirmed floor rounding for nonintegral gaps in BE-103.
- KuchiNet = NoOfKuchi * 2; TotalBoundaryNet = TotalNet + KuchiNet.
- TopperNet = ceil(min(LW,RW,LL,RL) / heightInInch) * oppositeSideRun. Width operation uses max(LL,RL); length operation uses max(LW,RW).
- Current denominator uses the main net product height even when a different topper product is selected; the owner confirmed this rule for mosquito-net-v1.
- BelowCloth = TotalBoundaryNet / max(floor(30 / max(2*topHeight + belowHeight,1)),1), or zero when disabled.
- For Fita a:b, requiredInches = TotalNet + a*max(LW,RW) + b*max(LL,RL).
- One Fita roll = 12 yards = 36 feet = 432 inches. Rolls = max(ceil(requiredInches/432),1).
- Net, topper and below-cloth prices are per yard: inches / 36 * product price. Fita priced per whole roll; bobin quantity is 1; Mojuri is Tk 200.
- Final custom unit price is rounded up. Example: 72/72/84/84 with 2:1 gives 540 inches and 2 rolls.
- CustomOptions carries product IDs, raw dimensions, optional flags, topper direction, Kuchi and Fita settings. Server stores calculated price, Fita length/rolls, topper and boundary quantities as audit strings.

## Prioritized next work

### BE-101 - P0 - Close price-validation bypasses (COMPLETE)

Current normalizeCustomItem accepts unknown custom-* items using client UnitPrice. Catalog pricing also falls back to client UnitPrice when stored prices are falsy. Builder product lookup checks existence but not category/subcategory; Fita ratios and Kuchi settings lack the UI's full allowed-value checks. These mean prior claims of complete tamper protection were too broad.

Acceptance: unsupported custom types rejected; no client price fallback; finite valid database prices and net height required; correct material categories enforced; strict string/boolean/numeric schemas; allowed styles/ranges enforced; quantities bounded positive integers; no fabricated product metadata accepted as fulfillment instructions. Add adversarial tests for each path. Document or remove the current Tk 1 submitted-price tolerance.

Completed 2026-10-23: checkout rejects unsupported custom types, invalid stored prices/heights, incorrect material categories and malformed builder options. Catalog prices come only from the database; builder prices are recalculated and must match exactly (the Tk 1 tolerance is removed). Fulfillment metadata is rebuilt from validated options and database products. Bounded quantities and carts are enforced. Regression coverage: 364 passing tests across 17 suites. See TESTING.md for limits and verification boundaries. No new endpoints or permission seeds were needed.

### BE-102 - P0 - Validate before adding to cart (COMPLETE)

Add a public rate-limited quote/validate endpoint for structured builder inputs. Reuse the same calculator at checkout. Return authoritative price, normalized options and breakdown; never trust a quote echoed from the browser without checkout verification. Coordinate CLIENT-101. Acceptance: changing client price or bypassing cart cannot lower the accepted order price.

Completed 2026-10-23: POST business/QuoteBuilder reuses checkout validation/calculation, returns normalized material metadata and per-unit breakdown, and does not create orders. Checkout rereads current products and rejects altered or stale prices. Both permission collections seeded and replay verified (five records each), including the owner-approved new FeatureRoleMap schema. Typecheck and 385 regression tests pass. CLIENT-101 remains separate: its exact request/response and UI handling contract is documented in docs/BUILDER_QUOTE.md. No production build or deployment performed.

### BE-103 - P1 - Units and formula contract (COMPLETE)

Define NetHeight unit explicitly across all repos and use it in fresh test/seed data; no existing-data conversion is required. Extract a pure calculator and fixture tests for both operations, below cloth, alternate topper, gap rounding and Fita boundaries 432/433/864 inches. Record formula version on orders. See ADMIN-101 and CLIENT-102.

Completed 2026-10-23: owner confirmed feet, main-fabric topper height and floor-based gap counting. Extracted pure mosquito-net-v1 calculator with fixtures for both operations, below cloth, alternate topper and 432/433/864-inch Fita boundaries. Product responses expose NetHeightUnit; admin labels feet; client preview uses full net height. Quote/options/orders record the formula version. No existing data conversion. See docs/UNITS_AND_ORDERS.md.

### BE-104 - P1 - Order operations (COMPLETE)

Add authorized paginated order listing/details, fulfillment transitions, cancellation and audit history for ADMIN-102. Define stock reservation/consumption timing and atomic updates so duplicate orders or simultaneous checkout cannot oversell. Keep order status distinct from payment status.

Completed 2026-10-23: admin-only ListOrders/GetOrder/TransitionOrder APIs, separate unpaid payment status, versioned transitions and append-only audit. Owner selected deduction on confirmation, not checkout. Confirmation/cancellation use transactions, conditional stock updates and stored material snapshots. UUID request-ID uniqueness prevents checkout retry duplicates. Both permission maps and indexes were seeded/replayed. Eight isolated local replica-set integration tests verify concurrency, rollback, cancellation, access and pagination. ADMIN-102 UI and BE-106 invoice inventory consistency remain separate work. See docs/UNITS_AND_ORDERS.md.

### BE-105 - P1 - Manual order handling (COMPLETE)

Final owner decision (2026-10-24): no payment-method selection or online payment during order placement. A valid Bangladesh mobile number is mandatory. Explain that a salesperson will contact the customer, delivery charges may be requested in advance, and products may be sent cash on delivery. Handle collection and agreement manually; do not mark orders paid automatically. New orders require immediate admin follow-up. Coordinate CLIENT-104 messaging and admin follow-up UI using existing order endpoints. Gateway sessions, wallet integrations and automated payment callbacks are not part of this business workflow.

Implemented 2026-10-24: mandatory normalized Bangladesh mobile number, fixed manual/unpaid order fields and immediate-action queue flag. Existing ListOrders supports NeedsAction; successful admin transitions clear the flag transactionally. Backend verification: 431 tests, 158 HTTP contract tests, 9 isolated Mongo integration tests and typecheck passed. No new endpoint/permission mappings or merchant configuration required. See docs/MANUAL_ORDER_WORKFLOW.md for the final decision and frontend handoff.

### BE-106 - P1 - Invoice consistency and access tests (TODO)

Test create/edit/delete effects on stock, dues and dashboards; prevent partial multi-document updates. Verify wholesaler A cannot read B's list/detail/dashboard or private profit/cost fields. Review all role enforcement, not only UI navigation.

### BE-107 - P1 - Due-payment reporting policy (DECISION)

Current requested behavior counts recovered dues as profit. Decide how cash received, sales revenue and gross profit should be reported to avoid counting original-sale profit twice. Agree the reporting policy before launch and test it with fresh invoices and due payments; existing test records need not be preserved.

### BE-108 - P2 - Maintenance and deployment (TODO)

Audit dependencies and Node compatibility before choosing upgrade targets; NestJS 11 migration already present. Add targeted tests/CI, deployment smoke checks, log redaction, environment documentation and backup/restore procedure. Verify CAPTCHA key type, hostname policy, distributed rate limiting and CORS policy. Historical secret exposure requires credential revocation/rotation verification; ignoring .env does not remove Git history.

## Future feature requests

### BE-109 - Optional product QR verification

- Status: TODO - documentation only; implementation deferred by user.
- Requested: 2026-10-23. Priority: to be assigned.
- Requirement: QR verification is available only for specifically enabled products, not automatically for the entire catalog. Scanning a code on a physical product identifies the linked product and displays its name and image.
- Backend scope: store the opt-in setting and code-to-product association; provide an authorized management operation and public verification lookup. The lookup returns only public product information, never cost, wholesale prices, customer or invoice data.
- Existing products remain disabled by default. Products without QR verification keep their existing behavior.
- Acceptance: a valid enabled code resolves to the correct product name/image; disabled, invalid or removed codes do not return a successful verification result; unauthorized users cannot enable or assign codes.
- Source areas: src/shared/schemas/product.schema.ts, src/business/dto/product/, src/business/services/product.service.ts, src/business/business.controller.ts; dedicated QR storage/service if individual-item codes are chosen.
- Dependencies: ADMIN-108 manages selected products and labels; CLIENT-110 displays scan results. Configure the public client URL for QR destinations without embedding secrets.
- Decision before implementation: one shared code per catalog product versus unique codes per physical item/batch. User has requested product identification, not yet item-level authenticity or ownership verification. A copied shared QR code cannot prove a physical item is genuine.
- Verification evidence: not implemented or tested.

### BE-110 - Inventory batches and globally unique item serials

- Status: TODO - documentation only; implementation deferred by user.
- Requested: 2026-10-23. Priority: to be assigned.
- Requirement: creating a product with stock creates a batch; adding quantity to an existing product creates a new batch. Each physical item belongs to one batch and receives a serial formatted BatchId_UniqueId. No two items anywhere in the inventory may share a serial.
- Data model plan: retain Product as the catalog definition; introduce batch records linked to Product and individual inventory-item records linked to both Product and Batch. One catalog product may have multiple batches. Store quantities, creation time and creating administrator for traceability.
- Acceptance: creating stock of N items creates one batch and N distinct serials; adding M items later creates a different batch and M new serials without modifying previous identities; product inspection can retrieve its batches and their items; repeated/concurrent requests cannot create duplicate serials or double-add stock.
- Enforce global serial uniqueness with a database unique index, not a frontend check or uniqueness scoped to a product. Use collision-resistant generation and safe retry handling; enforce batch ID uniqueness as well. Batch creation, item creation and stock totals must remain consistent on failure.
- Serial visibility: administrators only. Enforce this in backend authorization and response projection for every endpoint, including public catalog, QR verification, orders, invoices and wholesaler responses. Hiding a field in the frontend alone is insufficient. Never expose serials through errors or public identifiers.
- Source areas: src/shared/schemas/, src/business/services/product.service.ts, src/business/dto/product/, src/business/business.controller.ts, src/business/business.module.ts; invoice/order allocation services when allocation policy is defined.
- Dependencies: ADMIN-109 provides batch/item inspection; CLIENT-111 preserves public privacy; BE-109 QR design must not encode the admin-only serial in public QR URLs.
- Decisions before implementation: zero-quantity product creation behavior; handling fractional quantities for yard-based materials; stock correction versus new batch; FIFO/manual batch allocation for sales, returns and cancellations. Do not silently regenerate existing serials on edits.
- Interpretation: each physical stock item has a batch and serial, while the catalog product may represent many items/batches. Admin product selection should show all associated batches rather than a misleading single batch ID.
- Verification evidence: not implemented or tested. Required tests include global uniqueness across products/batches, concurrent additions, retry idempotency, rollback consistency and non-admin response exclusion.

### BE-111 - Employees, work ledger, payments and review feedback

- Status: TODO - documentation only; implementation deferred by user.
- Requested: 2026-10-23. Priority: to be assigned.
- Requirement: introduce an Employee user role. Admin can create employee accounts through the portal; employees can log in but only access their own landing-page data and feedback submission.
- Optional maker attribution: when creating product stock or adding existing-product quantity, admin may select the employee who made it. Leaving the maker empty is valid. Link attribution to the production batch (BE-110) so later additions by another employee do not overwrite earlier attribution. Expose applicable batch maker in admin product/batch inspection.
- Admin-only CRUD: employee records, daily work records and employee payment records can be created, read, edited and deleted by admin. Employees have an explicit read-only exception for their own history and balance, plus permission to submit their own review feedback. They cannot directly change authoritative work or money entries.
- Work ledger: record employee, work date, work description and amount earned/payable. Allow multiple work entries per day and aggregate daily work/earnings for the landing page. Production/batch linkage can be optional; attribution must not automatically create wages or double-count an independently entered daily work record without an agreed rule.
- Payment ledger: record employee, payment date, amount paid and note/reference as appropriate. Derive balance from authoritative records: earned minus paid. Positive means the business owes the employee; negative means an advance/overpayment balance in the business's favor; zero means settled. Display the direction explicitly. Other loans/deductions are not implied.
- Admin overview: total earned, total paid and current balance per employee, with work/payment histories. Create/edit/delete must consistently recalculate balances and daily totals. Use precise money arithmetic and preserve an audit record of financial corrections/deletions.
- Feedback: employee can raise a review request against their own work/payment entry when an amount appears incorrect, supplying an explanation. It starts pending and creates an admin portal notification. Employee cannot submit feedback for another employee's records.
- Resolution: admin accepts or declines with a required message/note; persist resolver, time and outcome. Employee can read the outcome. Acceptance must explicitly record any linked ledger correction through admin-controlled operations; accepting feedback alone must not silently change money. Decline keeps the ledger unchanged. Prevent duplicate resolution effects.
- Notification scope: in-portal admin notifications for new feedback; unread/read handling and link to the affected employee/entry. Email, SMS and push are not requested.
- Source areas: src/shared/constant/roles.constant.ts, src/shared/schemas/user.schema.ts, src/auth/, src/user/, new employee/work/payment/feedback schemas and services, product/production DTOs and batch service planned by BE-110.
- Dependencies: ADMIN-110 provides admin and employee screens; CLIENT-112 records storefront separation. BE-110 owns optional maker-to-batch relation.
- Acceptance: admin can CRUD employees/work/payments; employee A sees only A's work and balance and cannot mutate ledger data or read B's data by changing IDs; daily totals and signed balances agree after edits/deletes; maker is optional; feedback triggers notification; both resolution outcomes require notes and appear to the submitting employee.
- Decisions: employee login/onboarding fields; business-day timezone (proposed Asia/Dhaka); whether one batch can have multiple makers (initial request names one); whether maker selection suggests or creates work entries; account deletion/deactivation policy preserving ledger history; whether employees see payment history details as well as totals; feedback withdrawal/resubmission rules. Confirm before dependent implementation.
- Verification evidence: not implemented or tested. Required tests: role/ownership authorization, concurrent payments/corrections, balance direction, daily aggregation, optional attribution, notification delivery and feedback resolution transitions.

### ID: REPLACE-NEXT - Feature name

Copy this block for each new request.

- Status: TODO
- Priority: P0 / P1 / P2
- Requested behavior:
- Business rules and examples:
- Affected screens or endpoints:
- Related IDs in companion plans:
- Acceptance criteria:
- Fresh database/seed or environment configuration:
- Verification evidence:
- Completion date and commit:

## Change log

- 2026-10-23: Implemented NestJS 12.2.0 migration on dev with compatible companion packages, Express 5, Multer 2, TypeScript 6 and Jest 30. All 293 tests pass on Node 24.22.1 and 26.0.0; no-output type checks and HTTP suite pass. See MIGRATION.md for deployment steps, remaining audit findings and unverified production checks. No build, live database operation, commit or deployment.

- 2026-10-23: Expanded tests to 293 passing across 16 suites with 86.88% source line coverage and 80.34% branch coverage. Added real signed-JWT HTTP verification with mocked models, builder/AI/storage/Redis/user tests and invoice edit/dashboard checks. Fixed admin role membership in user update/delete after reproducing authorization failures. Remaining integration and accounting risks are in TESTING.md. No migration, live-data changes, build, commit or push.

- 2026-10-23: Added the API regression baseline documented in [TESTING.md](TESTING.md): 33 registered routes, 193 passing tests across 8 suites, 100% controller line/function coverage and 61.88% overall source line coverage. Live dependencies are mocked; deeper service/integration gaps and security findings remain. Pause NestJS migration until these gaps are reviewed. No runtime changes, database edits or production builds were performed.

- 2026-10-23: Required FeatureEndpointMap and FeatureRoleMap seed updates and permission checks for every new API. Planning only; no database changes.

- 2026-10-23: Adopted disposable-data, pre-launch MVP scope; no legacy migrations required. Documentation only; no database reset performed.

- 2026-10-23: Created source-mapped baseline and actionable backlog. Documentation only; no runtime tests or builds performed for this inventory.

