const DEFAULT_TIMEOUT_MS = 30_000
const API_BASE = (import.meta.env.VITE_BOM_API_URL as string | undefined) ?? ''

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(API_BASE + path, { ...init, signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error).name === 'AbortError') {
      throw new ApiError(0, null, `Request timed out: ${path}`)
    }
    throw new ApiError(0, null, `Network error: ${(err as Error).message}`)
  }
  clearTimeout(timer)

  if (!res.ok) {
    const raw = await res.text()
    let body: unknown
    try { body = JSON.parse(raw) } catch { body = raw }
    throw new ApiError(res.status, body, `HTTP ${res.status} from ${path}`)
  }

  return res.json() as Promise<T>
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' })
}

export function post<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs)
}

export function postForm<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: form })
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
