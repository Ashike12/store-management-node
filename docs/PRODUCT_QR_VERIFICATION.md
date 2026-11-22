# Product QR verification

BE-109 uses one opaque, random QR token per opted-in catalog product. It identifies a product but does not prove that a physical item is genuine, purchased or owned by the scanner. Inventory serial numbers are never encoded or returned.

## Configuration

Set `PUBLIC_CLIENT_URL` to the deployed storefront origin, without a route. For example:

```env
PUBLIC_CLIENT_URL=https://shop.example.com
```

Run the replay-safe database seed once in each environment:

```powershell
npm run seed:product-qr
```

The seed creates the unique token index and writes `ConfigureProductQr` and `VerifyProductQr` to both permission collections.

## API behavior

- `POST /business/ConfigureProductQr` is admin-only. Actions are `enable`, `disable` and `rotate`.
- `POST /business/VerifyProductQr` is public and rate-limited. It returns only `ProductName` and `ImageUrl`.
- Enabling an already configured product keeps its current label.
- Rotating creates a new token and immediately invalidates the previous label.
- Disabling makes the current label return `404`; re-enabling restores that same label unless it is rotated.
- Existing products are disabled by default.

## Public catalog exposure (cart QR)

`GetClientProducts` returns `QrVerificationUrl` (`<PUBLIC_CLIENT_URL>/verify-product/<token>`) for products with QR verification enabled, and `null` otherwise. The storefront cart renders it as a scannable QR code. This is a deliberate owner decision: the URL resolves only to product name and image, but anyone browsing the shop can now read an enabled product's token. Rotating a product's code (`ConfigureProductQr` action `rotate`) invalidates the old one. `QrVerificationToken` and `QrVerificationEnabled` are still never returned on their own, and inventory serials are never involved.

## Per-unit QR codes (batch sticker sheet)

Every inventory unit has its own opaque `QrToken` (unique partial index, created by `npm run seed:inventory`). It is unrelated to the serial number, which stays admin-only.

- `POST /business/ListBatchQrCodes` (admin only; `BatchId`, `Page`, `Size` up to 500) returns `{ UnitIndex, QrVerificationUrl }` per unit. It never returns serials. Units created before this feature get a token on first request (conditional write, race-safe), so no data migration is needed.
- It fails with 400 unless the product has QR verification enabled and `PUBLIC_CLIENT_URL` is set.
- `POST /business/VerifyProductQr` accepts product codes and unit codes alike and returns only product name and image. A unit code works only while the product's QR verification is enabled; disabling it makes every unit code return 404. Rotating the product code does not change unit codes.
- Run `npm run seed:inventory` once per environment to add the `ListBatchQrCodes` permission rows and the token index.

