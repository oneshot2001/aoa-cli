import type { DeviceCredential } from '../types/device.js'
import { getCredentialBackend, type KeychainBackend } from '../storage/keychain.js'
import { ensureMigrated } from '../storage/migrate.js'

const CREDENTIAL_SERVICE = 'device-credentials'

let _initialized = false

function init() {
  if (_initialized) return
  _initialized = true
  ensureMigrated()
}

const backend = getCredentialBackend()

export const credentialStore = {
  add(ip: string, username: string, password: string): void {
    init()
    const payload = JSON.stringify({ username, password })
    backend.set(CREDENTIAL_SERVICE, ip, payload)
    if ('trackAccount' in backend) {
      (backend as KeychainBackend).trackAccount(CREDENTIAL_SERVICE, ip)
    }
  },

  get(ip: string): DeviceCredential | undefined {
    init()
    const raw = backend.get(CREDENTIAL_SERVICE, ip)
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw) as { username: string; password: string }
      return { ip, username: parsed.username, password: parsed.password }
    } catch {
      return undefined
    }
  },

  list(): DeviceCredential[] {
    init()
    const entries = backend.list(CREDENTIAL_SERVICE)
    const results: DeviceCredential[] = []
    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry.password) as { username: string; password: string }
        results.push({ ip: entry.account, username: parsed.username, password: parsed.password })
      } catch {
        // Skip malformed entries
      }
    }
    return results
  },

  remove(ip: string): boolean {
    init()
    const deleted = backend.delete(CREDENTIAL_SERVICE, ip)
    if (deleted && 'untrackAccount' in backend) {
      (backend as KeychainBackend).untrackAccount(CREDENTIAL_SERVICE, ip)
    }
    return deleted
  },

  has(ip: string): boolean {
    init()
    return backend.get(CREDENTIAL_SERVICE, ip) !== undefined
  },
}
