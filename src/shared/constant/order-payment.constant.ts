// Orders are sales enquiries followed up manually, not online payment sessions.
export const ORDER_PAYMENT_HANDLING = 'manual';
export const BD_MOBILE_PATTERN = /^01[3-9]\d{8}$/;

export function normalizeOrderPhone(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\s-]/g, '').replace(/^\+?88/, '');
}
