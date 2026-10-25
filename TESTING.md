# Backend API regression baseline

Date: 2026-10-23. The local NestJS 12 migration is implemented and regression-tested; see [MIGRATION.md](MIGRATION.md). These tests are not a claim that every service branch or security requirement is correct.

## Run

```sh
npm test -- --runInBand
npm run test:cov -- --runInBand
npm run test:e2e -- --runInBand
```

The e2e script runs the HTTP contract suite with mocked services, NOT a full database-backed end-to-end deployment. No production build is needed.

Coverage output is ignored by Git: `coverage/lcov-report/index.html`, `coverage/lcov.info`, and `coverage/coverage-summary.json`. Controller lines and functions have a 100% coverage threshold. Overall source coverage still includes untested services, bootstrap code and schemas; it is intentionally not narrowed to inflate the result.

## Safety and boundaries

- Tests do not load `.env`, import AppModule, connect MongoDB/Redis, or call Google/Gemini. Models, Redis and external fetch are mocked.
- Multipart upload/download tests use an isolated OS temporary directory and remove only that test directory afterward.
- The API matrix uses real Nest routing, validation, exception handling and upload middleware with a controlled test auth guard. A separate jwt-http.spec.ts suite exercises real Passport signed JWT verification, expiry, malformed tokens, deleted accounts and permission denial against mocked models.
- BE-102 adds public QuoteBuilder permission seeds and a replay test. The approved manual seed was applied separately to the configured database and verified as five records in each collection after replay. Automated API tests continue to use mocks; this is not full database-backed application testing.
- Financial and ownership tests exercise real service code with mocked persistence. They do not prove MongoDB transactions, concurrency, indexes or deployment configuration.

## API inventory

`src/api.spec.ts` has an explicit case for every registered route and a metadata check that fails when routes are added without updating the matrix. Each case checks success dispatch and service-error propagation. Guarded routes check missing authentication; relevant routes check invalid DTOs and wholesaler denial.

| Controller | Routes covered |
| --- | --- |
| App (1) | GET `/` |
| Auth (5) | POST `/auth/signup`, `/auth/token`, `/auth/refresh`, `/auth/setPassword`, `/auth/getloginlog` |
| User (9) | GET `/user/get`, `/user/me`, `/user/getById/:id`; POST `/user/getByEmail`, `/user/createCustomer`, `/user/update`, `/user/update-profile`, `/user/change-password`, `/user/delete` |
| Business (17) | POST `/business/ListOrders`, `/business/GetOrder`, `/business/TransitionOrder`, `/business/QuoteBuilder`, `/business/GetProducts`, `/business/GetClientProducts`, `/business/CreateClientOrder`, `/business/CreateProduct`, `/business/UpdateProduct`, `/business/DeleteProduct`, `/business/CreateInvoice`, `/business/UpdateInvoice`, `/business/GetInvoice`, `/business/DeleteInvoice`, `/business/GetDashboardData`, `/business/AddProduction`, `/business/GenerateAiSuggestion` |
| Storage (5) | POST `/storage/uploadFile`; GET `/storage/getFiles`, `/storage/getFilesByUser/:userId`, `/storage/getFile/:fileId`, `/storage/deleteFile/:fileId` |

## Focused service coverage

- Product: create/update/delete, category validation, duplicate rejection, combined search/price/category filters, `size`/`page` pagination, public price privacy and production quantity replacement behavior.
- Invoice: due-payment amounts, required wholesaler/product validation, own-invoice scoping, product sale stock changes, edit restoration, and dashboard query scoping/profit privacy. Aggregate results are mocked; these tests do not evaluate MongoDB pipelines.
- Client orders: authoritative catalog price, shipping, Dhaka address defaults, coupon calculation, quantity checks and CAPTCHA failures.
- Authentication: login failure paths, token issuance, refresh expiry, activation/password hashing and duplicate signup.
- User: current-password verification, password reuse rejection, profile field allowlisting, CRUD persistence, activation expiry commands and admin-only mutation checks regardless of role order.
- JWT/rate limits: permission lookup, existing fallback behavior, expiry, missing user, throttling boundaries and Redis failures.
- Custom builder: feet-to-inches conversion, topper direction/prices, optional below cloth, both kuchi styles, 432-inch fita-roll boundaries, price tampering, invalid options and missing products through the real checkout service.
- AI: Bengali-only prompt requirements, missing configuration, unsupported fields, model fallback/deduplication and empty/error responses. This verifies prompt construction, not that the remote model always returns Bengali.
- Storage and Redis: file metadata/access-list contracts, customer-scoped listings, expiring writes, NX counter creation and increments, all without infrastructure connections.
- Mongo URI configuration: synthetic credential encoding, URI priority, optional settings and missing-host errors.

## Recorded result

`npm run test:cov -- --runInBand --silent`: 19 suites, 412 tests passed. The previous baseline was 193 tests and 61.88% line coverage.

| Scope | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| Entire source (Nest 12 / updated tooling) | 83.79% | 78.04% | 88.05% | 84.08% |
| All five controllers | 100% | Not all branches covered | 100% | 100% |

Jest 30.5.2, ts-jest 29.4.15 and TypeScript 6.0.3 replace the previously incompatible transformer/compiler pairing. Test scripts now enable VM modules for Nest 12's ESM dependencies; Node 24.22.1 and 26.0.0 passed the suite. The Node VM-module experimental warning is expected. Use `npm run typecheck` for the separate no-output application type check.

## Findings and remaining migration gates

Do not interpret passing characterization tests as approval of existing unsafe behavior. The earlier baseline runtime fix was explicit admin membership checking in UserService.updateById/deleteById. Regression tests first reproduced 14 failing authorization cases, then passed after this fix. No API routes or permission seeds changed.

1. `user/getById`, `storage/getFilesByUser`, `storage/getFile`, and destructive GET `storage/deleteFile` currently lack authentication guards. Decide intended access, then add regression tests requiring that policy and permission seeds before exposing real data.
2. Stacked `@Post` decorators currently register only the hyphenated profile/password routes. The camelCase names are not additional registered aliases. Use route arrays if both names are intended, with tests and permission entries for both.
3. FIXED: UserService.updateById/deleteById now use explicit admin membership rather than indexOf truthiness. Login-log filtering still has a separate role-index bug and ignores requested date bounds; its intended visibility policy needs tests and correction.
4. Product pagination consumes `size` and `page`. `Number(undefined) ?? default` does not handle NaN. Add desired invalid/missing pagination behavior tests and fix consistently across paginated services.
5. Added invoice edit/stock, dashboard privacy, builder/tampering, AI fallback, storage and user CRUD tests. Remaining gaps include invoice delete stock restoration (current delete only removes the invoice), atomic multi-document writes, actual aggregation evaluation and ownership enforcement for unguarded file endpoints.
6. Add isolated disposable-database integration tests for actual permissions/seed replay, Mongo queries and transactions, Redis expiry and concurrent writes. Signed JWT rejection is now tested without a database. Never point integration tests at a live `.env` database by default.
7. Verify bootstrapping, CORS and Vercel smoke behavior after migration. Production builds remain opt-in at the owner's request.
8. Dashboard getTotalDueAmount currently contributes PaymentAmount minus PaymentAmount (zero) for due-payment invoices, so it does not reduce prior outstanding dues. Add a real aggregation regression for an unpaid sale followed by a due payment, and correct the balance independently of revenue/profit reporting policy.
9. FIXED (BE-101): unknown custom types, client-price fallback, malformed builder options and mismatched material categories are rejected. Fulfillment metadata is rebuilt server-side. Adversarial regression tests cover these paths.

## Adding an API

Add its explicit HTTP matrix entry, valid/invalid/unauthorized cases, service behavior tests and ownership cases where applicable. Update FeatureEndpointMap and FeatureRoleMap seeds as required by IMPLEMENTATION_PLAN.md. Run tests and coverage, record any remaining gaps, and do not mark a feature complete based on controller coverage alone.

## BE-101 checkout validation contract

- Catalog price is the stored discounted price, or regular price only when the discounted price is absent. Zero, negative, non-finite, string or excessive stored prices are rejected, never replaced with a client price.
- Only the mosquito-net custom builder is supported. Its submitted price must exactly match the rounded server calculation; the previous Tk 1 tolerance is removed.
- Material categories/subcategories and both net heights are validated. Net height remains stored in feet and converted to inches. Existing pricing formulas are unchanged.
- Builder options require strings, explicit true/false flags, decimal measurements and allowlisted styles. Kuchi count is an integer 4-10, gap is an integer 2-12. Unknown fulfillment metadata is discarded; names and images come from database products.
- Safety ceilings in order-validation.constant.ts: 100 cart lines, quantity 1-1000 (integer), measurements 1-1200 inches, unit price at most Tk 10,000,000. These are checkout safety limits, not stock availability guarantees.
- DTO and real-service tests cover invalid prices, quantities, flags, materials, numeric formats, metadata forgery and unknown custom types. All persistence and external verification remain mocked; no live database, Redis or production build is used.
- Existing endpoints only: no FeatureEndpointMap or FeatureRoleMap additions required. The separate pre-cart quote endpoint remains BE-102.

## BE-102 quote verification

- Quote and checkout share the same parser/calculator and normalized output; valid quotes cause no CAPTCHA calls or order writes.
- Tests cover unsupported builders, malformed options, bounded integer quantity, forged totals, price changes after quoting, HTTP DTO rejection and rate-limit 429 responses. Existing direct-checkout tampering tests ensure skipping the quote cannot bypass pricing.
- Permission seed replay is tested in memory, and its approved manual application/replay was verified against the configured database (five records in each mapping collection). No customer/order/product data was modified.
- Contract and CLIENT-101 handoff: [BUILDER_QUOTE.md](docs/BUILDER_QUOTE.md). Client integration is not implemented in this backend task.

## BE-103 / BE-104 verification

- Pure mosquito-net-v1 fixture suite preserves the approved formulas and feet/inches contract.
- Checkout request-id replay, conflicting payload and duplicate-key race tests use mocked persistence.
- `npm run test:integration` separately passed 8 real MongoDB replica-set tests: concurrent confirmations cannot oversell; duplicate transitions do not double-deduct; partial-material failure rolls back; cancellation restores snapshots once; admin-only access, filtered pagination, lifecycle and unique request IDs are enforced.
- Integration tests use mongodb-memory-server-core with an isolated local MongoDB 7.0.11 binary, never .env/Atlas. Their service execution is not included in the normal unit coverage percentage. See docs/UNITS_AND_ORDERS.md for commands.
- Order endpoint permission seeds/indexes were applied and replayed separately against the configured database; no customer/order/product records were altered there.
- Client no-output typecheck and retry-ID tests pass. Admin typecheck reports existing unrelated CustomButton/unused-variable errors; the admin change is limited to height-label strings. No production builds run.

Final BE-103/104 run: 412 unit/contract tests (19 suites), 150 HTTP matrix tests via test:e2e, and 8 separate local Mongo integration tests passed. Coverage above excludes the separately executed integration suite, so order-operations service coverage is not reflected there. Backend/client no-output typechecks passed.

## BE-105 manual-order verification (2026-10-24)

- Backend: 431 tests across 19 suites passed; 158 HTTP contract tests passed; typecheck passed.
- Nine separate local MongoDB replica-set integration tests passed, including follow-up filtering/clearing and preserving the flag when stock confirmation fails.
- New cases cover mandatory/normalized phone input, equivalent retry identity, ignored forged payment fields, and boolean NeedsAction validation.
- Client: 38 focused mocked checkout/phone tests passed (41 tests across the full suite), and the no-output TypeScript check passed. Admin: 25 mocked UI/API tests and changed-file lint passed; its full typecheck still reports only pre-existing unrelated errors.
- Existing permission maps are unchanged: no new route or broader access is introduced. No hosted order, payment, CAPTCHA or notification was created during testing.
- Manual workflow and limits: docs/MANUAL_ORDER_WORKFLOW.md.

## BE-106 invoice consistency verification (2026-10-25)

- Invoice create, update and delete use MongoDB transactions across product stock, product-sale rows and invoice data. Conditional deductions prevent overselling.
- Strict service and DTO tests cover supported roles, nested numeric validation, safety limits, due-payment shape, wholesaler ownership and bounded pagination.
- HTTP tests verify admin-only mutations, admin/wholesaler reads, blocked app-user reads/writes, strict unknown-field rejection and service argument propagation.
- The isolated local replica-set suite covers successful create/edit/delete, rollback on insufficient stock and final-write failure, concurrent sales, product/due conversion, due totals, owner ACL changes, monthly dashboards, duplicate product rows, unique invoice numbers and cross-wholesaler privacy.
- Final verification: 449 tests across 19 unit/contract suites, 168 HTTP tests, 21 tests across both isolated MongoDB integration suites, and TypeScript typecheck passed. Changed-file ESLint completed with no errors; the repository's existing decorator/strictness warnings remain.
- Reporting terminology for recovered due remains BE-107. No new endpoint or permission seed was introduced. See docs/INVOICE_CONSISTENCY.md.
