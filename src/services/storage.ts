// ─────────────────────────────────────────────────────────────
// Единая точка доступа к localStorage: чтение JSON c fallback.
// Раньше функция load<T> дублировалась в auth.ts и store.ts.
// ─────────────────────────────────────────────────────────────

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}
