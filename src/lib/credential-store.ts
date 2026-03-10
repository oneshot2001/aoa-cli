import Conf from 'conf'
import type { DeviceCredential } from '../types/device.js'

const store = new Conf<{ credentials: Record<string, DeviceCredential> }>({
  projectName: 'axctl',
  schema: {
    credentials: {
      type: 'object',
      default: {},
    },
  },
})

export const credentialStore = {
  add(ip: string, username: string, password: string): void {
    const creds = store.get('credentials', {})
    creds[ip] = { ip, username, password }
    store.set('credentials', creds)
  },

  get(ip: string): DeviceCredential | undefined {
    return store.get('credentials', {})[ip]
  },

  list(): DeviceCredential[] {
    return Object.values(store.get('credentials', {}))
  },

  remove(ip: string): boolean {
    const creds = store.get('credentials', {})
    if (!creds[ip]) return false
    delete creds[ip]
    store.set('credentials', creds)
    return true
  },

  has(ip: string): boolean {
    return !!store.get('credentials', {})[ip]
  },
}
