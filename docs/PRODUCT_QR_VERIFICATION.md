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
