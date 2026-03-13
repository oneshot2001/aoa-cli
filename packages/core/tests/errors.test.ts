import { describe, test, expect } from 'bun:test'
import {
  ConnectionError,
  AuthenticationError,
  VapixApiError,
  FirmwareRequiredError,
  TimeoutError,
} from '../src/lib/errors.js'

describe('error types', () => {
  test('ConnectionError includes host and action hint', () => {
    const err = new ConnectionError('192.168.1.33')
    expect(err.name).toBe('ConnectionError')
    expect(err.message).toContain('192.168.1.33')
  })

  test('ConnectionError detects fetch failure', () => {
    const fetchErr = new TypeError('fetch failed')
    const err = new ConnectionError('10.0.0.1', fetchErr)
    expect(err.message).toContain('offline')
    expect(err.message).toContain('10.0.0.1')
    expect(err.cause).toBe(fetchErr)
  })

  test('AuthenticationError suggests axctl auth add', () => {
    const err = new AuthenticationError('192.168.1.33')
    expect(err.name).toBe('AuthenticationError')
    expect(err.message).toContain('axctl auth add 192.168.1.33')
  })

  test('VapixApiError includes endpoint and code', () => {
    const err = new VapixApiError('AOA', '2004', 'Invalid scenario ID')
    expect(err.name).toBe('VapixApiError')
    expect(err.code).toBe('2004')
    expect(err.message).toContain('AOA')
    expect(err.message).toContain('Invalid scenario ID')
  })

  test('FirmwareRequiredError suggests firmware check', () => {
    const err = new FirmwareRequiredError('MQTT analytics', '12.2')
    expect(err.name).toBe('FirmwareRequiredError')
    expect(err.message).toContain('12.2')
    expect(err.message).toContain('axctl firmware check')
  })

  test('TimeoutError includes duration', () => {
    const err = new TimeoutError('192.168.1.33', 15000)
    expect(err.name).toBe('TimeoutError')
    expect(err.message).toContain('15s')
    expect(err.message).toContain('192.168.1.33')
  })
})
