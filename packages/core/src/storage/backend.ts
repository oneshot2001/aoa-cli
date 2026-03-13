/**
 * CredentialBackend — pluggable interface for credential storage.
 * KeychainBackend (macOS) or FileBackend (Linux/Windows fallback).
 */

export interface CredentialBackend {
  get(service: string, account: string): string | undefined
  set(service: string, account: string, password: string): void
  delete(service: string, account: string): boolean
  list(service: string): Array<{ account: string; password: string }>
}
