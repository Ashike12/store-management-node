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
- Permission seeds are not modified because no new endpoints are introduced. FeatureEndpointMap behavior is tested with a mocked model. FeatureRoleMap schema and seed execution still need integration verification.
- Financial and ownership tests exercise real service code with mocked persistence. They do not prove MongoDB transactions, concurrency, indexes or deployment configuration.

## API inventory

`src/api.spec.ts` has an explicit case for every registered route and a metadata check that fails when routes are added without updating the matrix. Each case checks success dispatch and service-error propagation. Guarded routes check missing authentication; relevant routes check invalid DTOs and wholesaler denial.

| Controller | Routes covered |
| --- | --- |
| App (1) | GET `/` |
| Auth (5) | POST `/auth/signup`, `/auth/token`, `/auth/refresh`, `/auth/setPassword`, `/auth/getloginlog` |
| User (9) | GET `/user/get`, `/user/me`, `/user/getById/:id`; POST `/user/getByEmail`, `/user/createCustomer`, `/user/update`, `/user/update-profile`, `/user/change-password`, `/user/delete` |
| Business (13) | POST `/business/GetProducts`, `/business/GetClientProducts`, `/business/CreateClientOrder`, `/business/CreateProduct`, `/business/UpdateProduct`, `/business/DeleteProduct`, `/business/CreateInvoice`, `/business/UpdateInvoice`, `/business/GetInvoice`, `/business/DeleteInvoice`, `/business/GetDashboardData`, `/business/AddProduction`, `/business/GenerateAiSuggestion` |
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

`npm run test:cov -- --runInBand --silent`: 16 suites, 293 tests passed. The previous baseline was 193 tests and 61.88% line coverage.

| Scope | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| Entire source (Nest 12 / updated tooling) | 86.62% | 81.84% | 91.42% | 86.86% |
| All five controllers | 100% | Not all branches covered | 100% | 100% |

Jest 30.5.2, ts-jest 29.4.15 and TypeScript 6.0.3 replace the previously incompatible transformer/compiler pairing. Test scripts now enable VM modules for Nest 12's ESM dependencies; Node 24.22.1 and 26.0.0 passed the suite. The Node VM-module experimental warning is expected. Use `npm run typecheck` for the separate no-output application type check.

## Findings and remaining migration gates

Do not interpret passing characterization tests as approval of existing unsafe behavior. The only runtime fix in the continuation is explicit admin membership checking in UserService.updateById/deleteById. Regression tests first reproduced 14 failing authorization cases, then passed after this fix. No API routes or permission seeds changed.

1. `user/getById`, `storage/getFilesByUser`, `storage/getFile`, and destructive GET `storage/deleteFile` currently lack authentication guards. Decide intended access, then add regression tests requiring that policy and permission seeds before exposing real data.
2. Stacked `@Post` decorators currently register only the hyphenated profile/password routes. The camelCase names are not additional registered aliases. Use route arrays if both names are intended, with tests and permission entries for both.
3. FIXED: UserService.updateById/deleteById now use explicit admin membership rather than indexOf truthiness. Login-log filtering still has a separate role-index bug and ignores requested date bounds; its intended visibility policy needs tests and correction.
4. Product pagination consumes `size` and `page`. `Number(undefined) ?? default` does not handle NaN. Add desired invalid/missing pagination behavior tests and fix consistently across paginated services.
5. Added invoice edit/stock, dashboard privacy, builder/tampering, AI fallback, storage and user CRUD tests. Remaining gaps include invoice delete stock restoration (current delete only removes the invoice), atomic multi-document writes, actual aggregation evaluation and ownership enforcement for unguarded file endpoints.
6. Add isolated disposable-database integration tests for actual permissions/seed replay, Mongo queries and transactions, Redis expiry and concurrent writes. Signed JWT rejection is now tested without a database. Never point integration tests at a live `.env` database by default.
7. Verify bootstrapping, CORS and Vercel smoke behavior after migration. Production builds remain opt-in at the owner's request.
8. Dashboard getTotalDueAmount currently contributes PaymentAmount minus PaymentAmount (zero) for due-payment invoices, so it does not reduce prior outstanding dues. Add a real aggregation regression for an unpaid sale followed by a due payment, and correct the balance independently of revenue/profit reporting policy.
9. Custom checkout still accepts unrecognized custom-product types with client-supplied prices, and builder material categories are not enforced. Positive catalog-price fallback can also trust the submitted price when stored prices are absent. Existing tests of valid builder pricing do not resolve these bypasses.

## Adding an API

Add its explicit HTTP matrix entry, valid/invalid/unauthorized cases, service behavior tests and ownership cases where applicable. Update FeatureEndpointMap and FeatureRoleMap seeds as required by IMPLEMENTATION_PLAN.md. Run tests and coverage, record any remaining gaps, and do not mark a feature complete based on controller coverage alone.
