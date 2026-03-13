/**
 * Auto-migration from Conf (JSON) storage to SQLite + Keychain.
 * Non-destructive — renames old config.json to config.json.migrated.
 */
import { existsSync, readFileSync, renameSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { fleetRegistry, profileRegistry, configRegistry } from './registry.js'
import { getCredentialBackend, type KeychainBackend } from './keychain.js'
import type { CredentialBackend } from './backend.js'

const CREDENTIAL_SERVICE = 'device-credentials'

interface ConfData {
  credentials?: Record<string, { ip: string; username: string; password: string }>
  fleets?: Record<string, { name: string; ips: string[] }>
}

interface ProfileConfData {
  profiles?: Record<string, {
    name: string
    credentials: Record<string, { ip: string; username: string; password: string }>
    fleets: Record<string, { name: string; ips: string[] }>
    defaults: { format?: string; timeout?: number }
  }>
  activeProfile?: string
}

function findConfPath(): string | undefined {
  // Conf stores in platform-specific locations
  const platform = process.platform
  let configDir: string

  if (platform === 'darwin') {
    configDir = join(homedir(), 'Library', 'Preferences')
  } else if (platform === 'win32') {
    configDir = process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming')
  } else {
    configDir = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')
  }

  const path = join(configDir, 'axctl', 'config.json')
  return existsSync(path) ? path : undefined
}

function findProfileConfPath(): string | undefined {
  const platform = process.platform
  let configDir: string

  if (platform === 'darwin') {
    configDir = join(homedir(), 'Library', 'Preferences')
  } else if (platform === 'win32') {
    configDir = process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming')
  } else {
    configDir = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')
  }

  const path = join(configDir, 'axctl-profiles', 'config.json')
  return existsSync(path) ? path : undefined
}

export function migrateFromConf(backend: CredentialBackend): { migrated: boolean; stats: { credentials: number; fleets: number; profiles: number } } {
  const stats = { credentials: 0, fleets: 0, profiles: 0 }

  // Check if already migrated
  const migrationDone = configRegistry.get('migration_v1_done')
  if (migrationDone === 'true') return { migrated: false, stats }

  // Migrate main config (credentials + fleets)
  const confPath = findConfPath()
  if (confPath) {
    try {
      const raw = readFileSync(confPath, 'utf8')
      const data = JSON.parse(raw) as ConfData

      // Migrate credentials
      if (data.credentials) {
        for (const cred of Object.values(data.credentials)) {
          const payload = JSON.stringify({ username: cred.username, password: cred.password })
          backend.set(CREDENTIAL_SERVICE, cred.ip, payload)
          if ('trackAccount' in backend) {
            (backend as KeychainBackend).trackAccount(CREDENTIAL_SERVICE, cred.ip)
          }
          stats.credentials++
        }
      }

      // Migrate fleets
      if (data.fleets) {
        for (const fleet of Object.values(data.fleets)) {
          fleetRegistry.create(fleet.name, fleet.ips)
          stats.fleets++
        }
      }

      // Rename old file
      renameSync(confPath, confPath + '.migrated')
    } catch {
      // If migration fails, don't block — old store still works
    }
  }

  // Migrate profiles
  const profilePath = findProfileConfPath()
  if (profilePath) {
    try {
      const raw = readFileSync(profilePath, 'utf8')
      const data = JSON.parse(raw) as ProfileConfData

      if (data.profiles) {
        for (const profile of Object.values(data.profiles)) {
          profileRegistry.create(profile.name)
          profileRegistry.update(profile.name, {
            name: profile.name,
            credentials: profile.credentials,
            fleets: profile.fleets,
            defaults: profile.defaults,
          })
          stats.profiles++
        }
      }

      if (data.activeProfile) {
        configRegistry.set('activeProfile', data.activeProfile)
      }

      renameSync(profilePath, profilePath + '.migrated')
    } catch {
      // Non-fatal
    }
  }

  // Mark migration as done
  configRegistry.set('migration_v1_done', 'true')

  return { migrated: stats.credentials > 0 || stats.fleets > 0 || stats.profiles > 0, stats }
}

export function ensureMigrated(): void {
  const backend = getCredentialBackend()
  const result = migrateFromConf(backend)
  if (result.migrated) {
    const parts: string[] = []
    if (result.stats.credentials > 0) parts.push(`${result.stats.credentials} credentials`)
    if (result.stats.fleets > 0) parts.push(`${result.stats.fleets} fleets`)
    if (result.stats.profiles > 0) parts.push(`${result.stats.profiles} profiles`)
    process.stderr.write(`Migrated ${parts.join(', ')} from JSON to SQLite + Keychain\n`)
  }
}
