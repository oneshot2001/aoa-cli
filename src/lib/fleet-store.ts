import Conf from 'conf'

export interface Fleet {
  name: string
  ips: string[]
}

const store = new Conf<{ fleets: Record<string, Fleet> }>({
  projectName: 'axctl',
  schema: {
    fleets: {
      type: 'object',
      default: {},
    },
  },
})

export const fleetStore = {
  create(name: string, ips: string[]): void {
    const fleets = store.get('fleets', {})
    fleets[name] = { name, ips }
    store.set('fleets', fleets)
  },

  get(name: string): Fleet | undefined {
    return store.get('fleets', {})[name]
  },

  list(): Fleet[] {
    return Object.values(store.get('fleets', {}))
  },

  remove(name: string): boolean {
    const fleets = store.get('fleets', {})
    if (!fleets[name]) return false
    delete fleets[name]
    store.set('fleets', fleets)
    return true
  },

  has(name: string): boolean {
    return !!store.get('fleets', {})[name]
  },

  addDevices(name: string, ips: string[]): boolean {
    const fleets = store.get('fleets', {})
    if (!fleets[name]) return false
    fleets[name].ips = [...new Set([...fleets[name].ips, ...ips])]
    store.set('fleets', fleets)
    return true
  },

  removeDevices(name: string, ips: string[]): boolean {
    const fleets = store.get('fleets', {})
    if (!fleets[name]) return false
    fleets[name].ips = fleets[name].ips.filter((ip) => !ips.includes(ip))
    store.set('fleets', fleets)
    return true
  },
}
