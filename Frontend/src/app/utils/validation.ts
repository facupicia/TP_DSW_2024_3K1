export const PASSWORD_MIN_LENGTH = 8;

export const PHONE_PATTERN = /^\+?[0-9\s\-()]{6,15}$/;

export function normalizeOptionalText(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}
