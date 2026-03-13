import { fleetRegistry } from '../storage/registry.js'
import { ensureMigrated } from '../storage/migrate.js'

export interface Fleet {
  name: string
  ips: string[]
}

let _initialized = false

function init() {
  if (_initialized) return
  _initialized = true
  ensureMigrated()
}

export const fleetStore = {
  create(name: string, ips: string[]): void {
    init()
    fleetRegistry.create(name, ips)
  },

  get(name: string): Fleet | undefined {
    init()
    return fleetRegistry.get(name)
  },

  list(): Fleet[] {
    init()
    return fleetRegistry.list()
  },

  remove(name: string): boolean {
    init()
    return fleetRegistry.remove(name)
  },

  has(name: string): boolean {
    init()
    return fleetRegistry.has(name)
  },

  addDevices(name: string, ips: string[]): boolean {
    init()
    return fleetRegistry.addDevices(name, ips)
  },

  removeDevices(name: string, ips: string[]): boolean {
    init()
    return fleetRegistry.removeDevices(name, ips)
  },
}
