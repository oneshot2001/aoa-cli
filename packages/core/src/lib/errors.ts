/**
 * Shared error types for axctl VAPIX clients.
 *
 * These provide field-actionable error messages so CLI users know
 * exactly what to do when something fails.
 */

/** Camera is unreachable (connection refused, DNS failure, timeout). */
export class ConnectionError extends Error {
  constructor(host: string, cause?: unknown) {
    const msg = cause instanceof TypeError && String(cause).includes('fetch failed')
      ? `Cannot connect to ${host} — camera may be offline, wrong IP, or unreachable on this network`
      : `Connection to ${host} failed`
    super(msg)
    this.name = 'ConnectionError'
    this.cause = cause
  }
}

/** Camera returned 401 — wrong username/password. */
export class AuthenticationError extends Error {
  constructor(host: string) {
    super(`Authentication failed for ${host} — check credentials with \`axctl auth add ${host}\``)
    this.name = 'AuthenticationError'
  }
}

/** Camera returned an API-level error (HTTP was OK, but the VAPIX method failed). */
export class VapixApiError extends Error {
  code: string
  constructor(endpoint: string, code: string, message: string) {
    super(`${endpoint}: ${message} (code: ${code})`)
    this.name = 'VapixApiError'
    this.code = code
  }
}

/** Feature requires newer firmware than the camera has. */
export class FirmwareRequiredError extends Error {
  constructor(feature: string, requiredVersion: string) {
    super(`${feature} requires AXIS OS ${requiredVersion} or later — check firmware with \`axctl firmware check <ip>\``)
    this.name = 'FirmwareRequiredError'
  }
}

/** Request timed out. */
export class TimeoutError extends Error {
  constructor(host: string, timeoutMs: number) {
    super(`Request to ${host} timed out after ${Math.round(timeoutMs / 1000)}s — camera may be under heavy load or unreachable`)
    this.name = 'TimeoutError'
  }
}

/**
 * Wraps a fetch call with timeout and connection error handling.
 * Use this around all VAPIX HTTP calls for consistent error behavior.
 */
export async function safeFetch(
  url: string,
  init: RequestInit,
  host: string,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TimeoutError(host, timeoutMs)
    }
    throw new ConnectionError(host, err)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Check a VAPIX response for common error conditions.
 * Call after safeFetch for consistent error handling.
 */
export function checkResponse(res: Response, host: string, endpoint: string): void {
  if (res.status === 401) {
    throw new AuthenticationError(host)
  }
  if (!res.ok) {
    throw new Error(`${endpoint} on ${host}: HTTP ${res.status} ${res.statusText}`)
  }
}
