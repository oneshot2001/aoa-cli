import type { AlphaVisionConfig } from './config.js'

/** Build auth headers for AlphaVision API calls */
export function getHeaders(config: AlphaVisionConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (config.orgId) {
    headers['X-Org-Id'] = config.orgId
  }
  return headers
}

/** Validate API key against the AlphaVision platform */
export async function authenticate(config: AlphaVisionConfig): Promise<{
  ok: boolean
  orgName?: string
  error?: string
}> {
  try {
    const res = await fetch(`${config.apiUrl}/v1/auth/validate`, {
      method: 'GET',
      headers: getHeaders(config),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${body || res.statusText}` }
    }

    const data = (await res.json()) as { orgName?: string }
    return { ok: true, orgName: data.orgName }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Ping the platform health endpoint to verify connectivity */
export async function validateConnection(config: AlphaVisionConfig): Promise<{
  reachable: boolean
  version?: string
  error?: string
}> {
  try {
    const res = await fetch(`${config.apiUrl}/v1/health`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` },
    })

    if (!res.ok) {
      return { reachable: false, error: `HTTP ${res.status}: ${res.statusText}` }
    }

    const data = (await res.json()) as { version?: string; status?: string }
    return { reachable: true, version: data.version }
  } catch (err) {
    return { reachable: false, error: (err as Error).message }
  }
}
