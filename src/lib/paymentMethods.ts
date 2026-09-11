export const PAYMENT_METHODS = [
  'CASH',
  'G PAY',
  'CARD',
  'OTHERS',
] as const;

export type PaymentMethodType = typeof PAYMENT_METHODS[number];
