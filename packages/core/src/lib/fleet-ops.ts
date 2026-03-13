import { fleetStore } from './fleet-store.js'
import { credentialStore } from './credential-store.js'

export interface FleetResult<T> {
  ip: string
  result?: T
  error?: string
}

/**
 * Run fn against every camera in a fleet in parallel (Promise.allSettled).
 * Cameras without stored credentials get an error row (not a thrown exception).
 */
export async function fleetExec<T>(
  fleetName: string,
  fn: (ip: string, username: string, password: string) => Promise<T>
): Promise<FleetResult<T>[]> {
  const fleet = fleetStore.get(fleetName)
  if (!fleet) throw new Error(`Fleet "${fleetName}" not found`)

  const settled = await Promise.allSettled(
    fleet.ips.map(async (ip): Promise<FleetResult<T>> => {
      const cred = credentialStore.get(ip)
      if (!cred) throw new Error(`no credentials — run: axctl auth add ${ip}`)
      const result = await fn(ip, cred.username, cred.password)
      return { ip, result }
    })
  )

  return fleet.ips.map((ip, i) => {
    const r = settled[i]!
    if (r.status === 'fulfilled') return r.value
    return { ip, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
  })
}
