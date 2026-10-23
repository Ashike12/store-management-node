# NestJS 12 migration

Date: 2026-10-23. Implemented locally on `dev`; not committed, pushed or deployed. Existing test work and the user-permission fix were preserved.

## Dependency changes

Latest stable Nest framework version was verified against the npm registry before installation.

| Component | Before | After |
| --- | --- | --- |
| Nest common/core/platform-express/testing | 11.1.24 | 12.2.0 |
| Nest config | 4.0.4 | 12.0.1 |
| Nest JWT | 11.0.2 | 12.0.3 |
| Nest Mongoose / Passport | 11.0.4 / 11.0.5 | 12.0.0 / 12.0.0 |
| Nest CLI / schematics | 11.0.21 / 11.1.0 | 12.0.10 / 12.0.10 |
| TypeScript | 5.9.3 | 6.0.3 |
| Jest / ts-jest | 29.3.1 / 29.0.3 | 30.5.2 / 29.4.15 |
| Express / Multer | 4.21.1 / 1.4.5-lts.1 | 5.3.0 / 2.5.0 |
| Mongoose | 9.6.2 | 9.11.3 |

Corresponding Express, Multer, Jest and Node type packages and ts-loader were updated. TypeScript 7 was not selected because ts-jest's supported peer range is below 7. The lockfile includes compatible transitive audit fixes; no `--force` or `--legacy-peer-deps` was used.

## Runtime and source changes

- `.nvmrc` selects Node 24.22.1. Engines accept compatible Node 24 and Node 26. Verification ran on Node 24.22.1 and the machine's Node 26.0.0; the global runtime was not changed.
- Application code remains CommonJS. TypeScript now uses Node-aware module resolution, explicit project root/types and ES module interoperability. Removed unused baseUrl; source imports are relative.
- The Vercel dynamic bootstrap import uses the emitted `.js` extension required by Node-aware resolution.
- `start:prod` targets `dist/src/main.js`, matching the explicit compiler root and the existing `api/` entrypoint. This output path was checked with TypeScript's configuration API without emitting files.
- Storage's user-ID route uses `@Param('userId')` rather than the widened Express 5 `req.params` union. The URL and service arguments are unchanged.
- Jest scripts enable VM modules so Jest can consume Nest's ESM dependencies. `tsconfig.spec.json` retains the CommonJS test transformer; its Node10 resolver deprecation suppression is test-only. Application type checking uses the main Node-aware config.
- No new API routes, DTO business rules, database schemas, or permission mappings were introduced. FeatureEndpointMap/FeatureRoleMap seed changes are therefore not needed for this migration.

## Verification

- `npm run typecheck`: passed; no files emitted.
- `npm run test:cov -- --runInBand --silent`: 293 tests, 16 suites passed on Node 26.0.0.
- `npm run test:e2e -- --runInBand --silent`: 129 HTTP tests passed.
- The same 293 tests passed using Node 24.22.1.
- Production-config type check (`tsc --noEmit --incremental false -p tsconfig.build.json`) passed on Node 24.22.1.
- `npm ls --depth=0`: valid direct dependency tree, no invalid peer entries.
- Coverage: 86.86% lines, 86.62% statements, 81.84% branches, 91.42% functions. Controller line/function thresholds remain 100%. Compiler/runner changes alter instrumentation counts slightly; no tests were removed.

No production build, application startup against live services, database reset or Vercel deployment was performed. Jest's VM-module experimental warning is expected. Database-backed integration and actual Vercel startup remain unverified.

## Local and Vercel follow-up

1. Use Node 24.22.1 locally (for nvm-windows: `nvm install 24.22.1`, then `nvm use 24.22.1`). Do not keep using Node 20 for this project's tests/tooling.
2. Install from the updated lockfile with `npm ci` on other machines or CI. Run `npm run typecheck` and `npm test -- --runInBand`.
3. Before deployment, set the backend Vercel project to Node 24.x under Settings > Build and Deployment > Node.js Version. Retain secrets in Vercel environment settings, not Git.
4. Approve/run a production build and a preview deployment separately, then check bootstrap, authentication, uploads and database/Redis connectivity there. Do not treat these passing isolated tests as a live-deployment check.
5. Nest's guide notes that AWS Lambda can disable CommonJS-to-ESM loading. If the deployment logs specifically indicate that issue, check the platform's NODE_OPTIONS support and the documented `--experimental-require-module` option. No production environment flags were changed here.

## Remaining dependency risk

Final audit: 12 findings (11 high, 1 moderate), no critical findings. Remaining chains include Nodemailer 6, UUID 9, and old ESLint/nodemon globbing dependencies. These are not silently resolved by a Nest upgrade. Address them in a separately tested dependency/security pass; do not use forced audit fixes, which currently suggest a nodemon downgrade. The legacy lint toolchain was not migrated or claimed compatible with TypeScript 6; do not use its auto-fix command as migration verification.

Existing application/security/accounting findings in TESTING.md still apply.

## References

- [NestJS migration guide](https://docs.nestjs.com/migration-guide)
- [Jest ESM and CommonJS require support](https://jestjs.io/docs/ecmascript-modules)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
