import type { AlphaVisionConfig } from './config.js'
import { getHeaders } from './auth.js'
import { fleetStore } from '../lib/fleet-store.js'
import { credentialStore } from '../lib/credential-store.js'
import { VapixClient } from '../lib/vapix-client.js'

// ---- Types -------------------------------------------------------------------

export interface CameraRegistration {
  ip: string
  serial: string
  model: string
  firmware: string
  fleet?: string
  capabilities: string[]
}

export interface SyncResult {
  pushed: CameraRegistration[]
  failed: { ip: string; error: string }[]
}

export interface PullResult {
  added: string[]
  fleetName: string
}

export interface ReconcileResult {
  localOnly: string[]
  remoteOnly: string[]
  synced: string[]
}

// ---- Helpers -----------------------------------------------------------------

async function getCameraInfo(
  ip: string,
  username: string,
  password: string
): Promise<Omit<CameraRegistration, 'fleet' | 'capabilities'>> {
  const client = new VapixClient(ip, username, password)
  const info = await client.getDeviceInfo()
  return {
    ip,
    serial: info.ProdSerialNumber ?? 'unknown',
    model: info.ProdShortName ?? info.Model ?? 'unknown',
    firmware: info.Version ?? 'unknown',
  }
}

async function detectCapabilities(
  ip: string,
  username: string,
  password: string
): Promise<string[]> {
  const client = new VapixClient(ip, username, password)
  const caps: string[] = []

  // Check for AOA support
  try {
    const res = await client.post('/local/objectanalytics/control.cgi', {
      apiVersion: '1.0',
      method: 'getConfigurationCapabilities',
    }) as { data?: unknown }
    if (res?.data) caps.push('aoa')
  } catch {
    // No AOA support
  }

  // Check for PTZ support
  try {
    const props = await client.getAllProperties()
    if (props['root.Properties.PTZ.PTZ'] === 'yes') caps.push('ptz')
  } catch {
    // Skip
  }

  // Check for recording (edge storage)
  try {
    const res = await client.post('/axis-cgi/disks/list.cgi', {
      apiVersion: '1.0',
      method: 'getAllProperties',
    }) as { data?: { disks?: unknown[] } }
    if (res?.data?.disks && (res.data.disks as unknown[]).length > 0) caps.push('recording')
  } catch {
    // No edge storage
  }

  return caps
}

// ---- Push (local -> AlphaVision) ---------------------------------------------

export async function syncCameras(config: AlphaVisionConfig): Promise<SyncResult> {
  const fleets = fleetStore.list()
  const pushed: CameraRegistration[] = []
  const failed: { ip: string; error: string }[] = []

  // Collect all unique IPs across fleets
  const cameraFleetMap = new Map<string, string>()
  for (const fleet of fleets) {
    for (const ip of fleet.ips) {
      cameraFleetMap.set(ip, fleet.name)
    }
  }

  // Also include standalone credentials not in any fleet
  for (const cred of credentialStore.list()) {
    if (!cameraFleetMap.has(cred.ip)) {
      cameraFleetMap.set(cred.ip, '')
    }
  }

  for (const [ip, fleetName] of cameraFleetMap) {
    const cred = credentialStore.get(ip)
    if (!cred) {
      failed.push({ ip, error: 'no credentials stored' })
      continue
    }

    try {
      const info = await getCameraInfo(ip, cred.username, cred.password)
      const capabilities = await detectCapabilities(ip, cred.username, cred.password)
      const registration: CameraRegistration = {
        ...info,
        fleet: fleetName || undefined,
        capabilities,
      }

      const res = await fetch(`${config.apiUrl}/v1/cameras`, {
        method: 'PUT',
        headers: getHeaders(config),
        body: JSON.stringify(registration),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        failed.push({ ip, error: `HTTP ${res.status}: ${body || res.statusText}` })
        continue
      }

      pushed.push(registration)
    } catch (err) {
      failed.push({ ip, error: (err as Error).message })
    }
  }

  return { pushed, failed }
}

// ---- Pull (AlphaVision -> local) ---------------------------------------------

export async function pullCameras(
  config: AlphaVisionConfig,
  targetFleet = 'alphavision'
): Promise<PullResult> {
  const res = await fetch(`${config.apiUrl}/v1/cameras`, {
    method: 'GET',
    headers: getHeaders(config),
  })

  if (!res.ok) {
    throw new Error(`Failed to pull cameras: HTTP ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as { cameras?: CameraRegistration[] }
  const cameras = data.cameras ?? []

  if (cameras.length === 0) {
    return { added: [], fleetName: targetFleet }
  }

  // Create or update fleet
  const existing = fleetStore.get(targetFleet)
  const newIps = cameras.map((c) => c.ip)

  if (existing) {
    fleetStore.addDevices(targetFleet, newIps)
  } else {
    fleetStore.create(targetFleet, newIps)
  }

  const added = existing
    ? newIps.filter((ip) => !existing.ips.includes(ip))
    : newIps

  return { added, fleetName: targetFleet }
}

// ---- Reconcile (diff local vs remote) ----------------------------------------

export async function reconcile(config: AlphaVisionConfig): Promise<ReconcileResult> {
  // Get remote cameras
  const res = await fetch(`${config.apiUrl}/v1/cameras`, {
    method: 'GET',
    headers: getHeaders(config),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch remote cameras: HTTP ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as { cameras?: CameraRegistration[] }
  const remoteCameras = data.cameras ?? []
  const remoteIps = new Set(remoteCameras.map((c) => c.ip))

  // Get all local IPs across fleets + standalone credentials
  const localIps = new Set<string>()
  for (const fleet of fleetStore.list()) {
    for (const ip of fleet.ips) localIps.add(ip)
  }
  for (const cred of credentialStore.list()) {
    localIps.add(cred.ip)
  }

  const localOnly = [...localIps].filter((ip) => !remoteIps.has(ip))
  const remoteOnly = [...remoteIps].filter((ip) => !localIps.has(ip))
  const synced = [...localIps].filter((ip) => remoteIps.has(ip))

  return { localOnly, remoteOnly, synced }
}
