/**
 * macOS Keychain backend via `security` CLI.
 * Falls back to FileBackend on non-macOS systems.
 */
import { spawnSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { CredentialBackend } from './backend.js'

const KEYCHAIN_SERVICE_PREFIX = 'com.axctl'

export class KeychainBackend implements CredentialBackend {
  get(service: string, account: string): string | undefined {
    const result = spawnSync('security', [
      'find-generic-password',
      '-s', `${KEYCHAIN_SERVICE_PREFIX}.${service}`,
      '-a', account,
      '-w',
    ], { encoding: 'utf8' })

    if (result.status !== 0) return undefined
    return result.stdout.trim()
  }

  set(service: string, account: string, password: string): void {
    // Delete existing entry first (ignore errors if it doesn't exist)
    spawnSync('security', [
      'delete-generic-password',
      '-s', `${KEYCHAIN_SERVICE_PREFIX}.${service}`,
      '-a', account,
    ])

    const result = spawnSync('security', [
      'add-generic-password',
      '-s', `${KEYCHAIN_SERVICE_PREFIX}.${service}`,
      '-a', account,
      '-w', password,
      '-U', // Update if exists
    ])

    if (result.status !== 0) {
      throw new Error(`Failed to store credential in Keychain: ${result.stderr}`)
    }
  }

  delete(service: string, account: string): boolean {
    const result = spawnSync('security', [
      'delete-generic-password',
      '-s', `${KEYCHAIN_SERVICE_PREFIX}.${service}`,
      '-a', account,
    ])
    return result.status === 0
  }

  list(service: string): Array<{ account: string; password: string }> {
    // security dump-keychain doesn't show passwords, so we use a workaround:
    // We store a metadata entry listing all accounts for this service
    const accountList = this.get(service, '__accounts__')
    if (!accountList) return []

    const accounts = JSON.parse(accountList) as string[]
    const results: Array<{ account: string; password: string }> = []
    for (const account of accounts) {
      const password = this.get(service, account)
      if (password) results.push({ account, password })
    }
    return results
  }

  /** Track account names in a metadata entry so we can enumerate them */
  trackAccount(service: string, account: string): void {
    const existing = this.get(service, '__accounts__')
    const accounts = existing ? JSON.parse(existing) as string[] : []
    if (!accounts.includes(account)) {
      accounts.push(account)
      this.set(service, '__accounts__', JSON.stringify(accounts))
    }
  }

  /** Remove account from tracking */
  untrackAccount(service: string, account: string): void {
    const existing = this.get(service, '__accounts__')
    if (!existing) return
    const accounts = (JSON.parse(existing) as string[]).filter(a => a !== account)
    this.set(service, '__accounts__', JSON.stringify(accounts))
  }
}

/**
 * Fallback file-based credential store for non-macOS systems.
 * Stores credentials in ~/.axctl/credentials.json with chmod 600.
 */
export class FileCredentialBackend implements CredentialBackend {
  private readonly dir: string

  constructor() {
    this.dir = join(homedir(), '.axctl')
  }

  private filePath(service: string): string {
    return join(this.dir, `${service}-credentials.json`)
  }

  private read(service: string): Record<string, string> {
    const path = this.filePath(service)
    if (!existsSync(path)) return {}
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      return {}
    }
  }

  private write(service: string, data: Record<string, string>): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
    }
    const path = this.filePath(service)
    writeFileSync(path, JSON.stringify(data, null, 2))
    chmodSync(path, 0o600)
  }

  get(service: string, account: string): string | undefined {
    return this.read(service)[account]
  }

  set(service: string, account: string, password: string): void {
    const data = this.read(service)
    data[account] = password
    this.write(service, data)
  }

  delete(service: string, account: string): boolean {
    const data = this.read(service)
    if (!(account in data)) return false
    delete data[account]
    this.write(service, data)
    return true
  }

  list(service: string): Array<{ account: string; password: string }> {
    const data = this.read(service)
    return Object.entries(data).map(([account, password]) => ({ account, password }))
  }
}

/**
 * Get the appropriate credential backend for the current platform.
 */
export function getCredentialBackend(): CredentialBackend {
  if (process.platform === 'darwin') {
    // Verify security CLI is available
    const check = spawnSync('which', ['security'])
    if (check.status === 0) return new KeychainBackend()
  }
  return new FileCredentialBackend()
}
