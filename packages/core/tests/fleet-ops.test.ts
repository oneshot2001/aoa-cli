import { describe, test, expect, mock, beforeEach } from 'bun:test'

// Mock modules BEFORE importing the module under test
const mockFleetStore = {
  get: mock(() => undefined as { name: string; ips: string[] } | undefined),
}
const mockCredentialStore = {
  get: mock(() => undefined as { ip: string; username: string; password: string } | undefined),
}

mock.module('../src/lib/fleet-store.js', () => ({ fleetStore: mockFleetStore }))
mock.module('../src/lib/credential-store.js', () => ({ credentialStore: mockCredentialStore }))

// Import AFTER mocking
const { fleetExec } = await import('../src/lib/fleet-ops.js')

describe('fleetExec', () => {
  beforeEach(() => {
    mockFleetStore.get.mockReset()
    mockCredentialStore.get.mockReset()
  })

  test('throws when fleet is not found', async () => {
    mockFleetStore.get.mockReturnValue(undefined)
    await expect(fleetExec('ghost', async () => 'ok')).rejects.toThrow('Fleet "ghost" not found')
  })

  test('returns error row when credentials are missing', async () => {
    mockFleetStore.get.mockReturnValue({ name: 'lab', ips: ['10.0.0.1'] })
    mockCredentialStore.get.mockReturnValue(undefined)

    const results = await fleetExec('lab', async () => 'ok')
    expect(results).toHaveLength(1)
    expect(results[0]!.ip).toBe('10.0.0.1')
    expect(results[0]!.error).toContain('no credentials')
    expect(results[0]!.result).toBeUndefined()
  })

  test('returns result when fn succeeds', async () => {
    mockFleetStore.get.mockReturnValue({ name: 'lab', ips: ['10.0.0.1'] })
    mockCredentialStore.get.mockReturnValue({ ip: '10.0.0.1', username: 'root', password: 'pass' })

    const results = await fleetExec('lab', async (_ip, user) => `hello-${user}`)
    expect(results[0]!.result).toBe('hello-root')
    expect(results[0]!.error).toBeUndefined()
  })

  test('passes correct ip/username/password to fn', async () => {
    mockFleetStore.get.mockReturnValue({ name: 'lab', ips: ['10.0.0.5'] })
    mockCredentialStore.get.mockReturnValue({ ip: '10.0.0.5', username: 'admin', password: 's3cr3t' })

    let captured = { ip: '', user: '', pass: '' }
    await fleetExec('lab', async (ip, user, pass) => {
      captured = { ip, user, pass }
    })
    expect(captured.ip).toBe('10.0.0.5')
    expect(captured.user).toBe('admin')
    expect(captured.pass).toBe('s3cr3t')
  })

  test('runs all cameras in parallel — partial failure does not block others', async () => {
    mockFleetStore.get.mockReturnValue({ name: 'prod', ips: ['10.0.0.1', '10.0.0.2', '10.0.0.3'] })
    mockCredentialStore.get
      .mockReturnValueOnce({ ip: '10.0.0.1', username: 'root', password: 'pw' })
      .mockReturnValueOnce(undefined) // 10.0.0.2 — no creds
      .mockReturnValueOnce({ ip: '10.0.0.3', username: 'root', password: 'pw' })

    const results = await fleetExec('prod', async (ip) => `data-${ip}`)
    expect(results).toHaveLength(3)
    expect(results[0]!.result).toBe('data-10.0.0.1')
    expect(results[1]!.error).toContain('no credentials')
    expect(results[2]!.result).toBe('data-10.0.0.3')
  })

  test('captures thrown errors from fn as error row', async () => {
    mockFleetStore.get.mockReturnValue({ name: 'lab', ips: ['10.0.0.9'] })
    mockCredentialStore.get.mockReturnValue({ ip: '10.0.0.9', username: 'root', password: 'pw' })

    const results = await fleetExec('lab', async () => { throw new Error('connection refused') })
    expect(results[0]!.error).toBe('connection refused')
    expect(results[0]!.result).toBeUndefined()
  })

  test('returns results in same order as fleet.ips', async () => {
    const ips = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4']
    mockFleetStore.get.mockReturnValue({ name: 'big', ips })
    mockCredentialStore.get.mockImplementation(() => ({ ip: '10.0.0.x', username: 'root', password: 'pw' }))

    // Simulate variable latency — ip.3 resolves before ip.1
    const results = await fleetExec('big', async (ip) => {
      const delay = ip.endsWith('.1') ? 30 : ip.endsWith('.3') ? 1 : 10
      await new Promise((r) => setTimeout(r, delay))
      return ip
    })

    expect(results.map((r) => r.result)).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4'])
  })
})
