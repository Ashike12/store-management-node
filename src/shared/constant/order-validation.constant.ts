// Safety ceilings for public checkout, independent of browser validation.
export const ORDER_LIMITS = {
  items: 100,
  quantity: 1000,
  measurementInches: 1200,
  unitPrice: 10_000_000,
} as const;

export const FITA_STYLES = ['1:1', '1:2', '2:1', '3:2', '2:3'];
