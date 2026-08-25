export function normalizeContainerId(value: unknown): string {
  return String(value ?? '').trim();
}
