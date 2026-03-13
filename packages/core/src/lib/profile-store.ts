import { profileRegistry, configRegistry } from '../storage/registry.js'
import { credentialStore } from './credential-store.js'
import { fleetStore } from './fleet-store.js'
import { ensureMigrated } from '../storage/migrate.js'

export interface Profile {
  name: string
  credentials: Record<string, { ip: string; username: string; password: string }>
  fleets: Record<string, { name: string; ips: string[] }>
  defaults: {
    format?: string
    timeout?: number
  }
}

let _initialized = false

function init() {
  if (_initialized) return
  _initialized = true
  ensureMigrated()
}

export const profileStore = {
  create(name: string): void {
    init()
    profileRegistry.create(name)
  },

  get(name: string): Profile | undefined {
    init()
    return profileRegistry.get(name)
  },

  list(): Profile[] {
    init()
    return profileRegistry.list()
  },

  remove(name: string): boolean {
    init()
    return profileRegistry.remove(name)
  },

  has(name: string): boolean {
    init()
    return profileRegistry.has(name)
  },

  getActive(): string | undefined {
    init()
    return configRegistry.get('activeProfile')
  },

  setActive(name: string): void {
    init()
    configRegistry.set('activeProfile', name)
  },

  clearActive(): void {
    init()
    configRegistry.delete('activeProfile')
  },

  importFrom(name: string): void {
    init()
    const profile = profileRegistry.get(name)
    if (!profile) return

    const creds = credentialStore.list()
    profile.credentials = {}
    for (const c of creds) {
      profile.credentials[c.ip] = { ip: c.ip, username: c.username, password: c.password }
    }

    const fleets = fleetStore.list()
    profile.fleets = {}
    for (const f of fleets) {
      profile.fleets[f.name] = { name: f.name, ips: f.ips }
    }

    profileRegistry.update(name, profile)
  },

  activate(name: string): void {
    init()
    const profile = profileRegistry.get(name)
    if (!profile) return

    // Clear existing global credentials and fleets, then load from profile
    for (const c of credentialStore.list()) {
      credentialStore.remove(c.ip)
    }
    for (const f of fleetStore.list()) {
      fleetStore.remove(f.name)
    }

    for (const c of Object.values(profile.credentials)) {
      credentialStore.add(c.ip, c.username, c.password)
    }
    for (const f of Object.values(profile.fleets)) {
      fleetStore.create(f.name, f.ips)
    }

    configRegistry.set('activeProfile', name)
  },
}
