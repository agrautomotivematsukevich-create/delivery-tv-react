/**
 * utils/haptics.ts — Тактильная обратная связь.
 */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator?.vibrate?.(pattern);
  } catch {
    /* Устройство не поддерживает вибрацию */
  }
}
