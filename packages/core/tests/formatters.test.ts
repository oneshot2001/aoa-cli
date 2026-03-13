import { describe, test, expect } from 'bun:test'
import { formatOutput } from '../src/formatters/index.js'

const ROWS = [
  { ip: '192.168.1.1', model: 'Q6135', firmware: '11.2.3' },
  { ip: '192.168.1.2', model: 'P3245', firmware: '10.8.1' },
]

describe('formatOutput — json', () => {
  test('single object stays unwrapped', () => {
    const out = formatOutput({ a: 1, b: 'x' }, 'json')
    expect(JSON.parse(out)).toEqual({ a: 1, b: 'x' })
  })

  test('array stays as array', () => {
    const out = formatOutput(ROWS, 'json')
    const parsed = JSON.parse(out)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].ip).toBe('192.168.1.1')
  })
})

describe('formatOutput — jsonl', () => {
  test('one JSON object per line', () => {
    const out = formatOutput(ROWS, 'jsonl')
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!).ip).toBe('192.168.1.1')
    expect(JSON.parse(lines[1]!).ip).toBe('192.168.1.2')
  })

  test('single object produces one line', () => {
    const out = formatOutput({ x: 42 }, 'jsonl')
    expect(out.split('\n')).toHaveLength(1)
    expect(JSON.parse(out).x).toBe(42)
  })
})

describe('formatOutput — csv', () => {
  test('first row is header', () => {
    const out = formatOutput(ROWS, 'csv')
    const lines = out.split('\n')
    expect(lines[0]).toBe('ip,model,firmware')
  })

  test('data rows match input', () => {
    const lines = formatOutput(ROWS, 'csv').split('\n')
    expect(lines[1]).toBe('192.168.1.1,Q6135,11.2.3')
    expect(lines[2]).toBe('192.168.1.2,P3245,10.8.1')
  })

  test('values with commas are quoted', () => {
    const out = formatOutput([{ note: 'a, b, c' }], 'csv')
    const lines = out.split('\n')
    expect(lines[1]).toBe('"a, b, c"')
  })

  test('values with double-quotes are escaped per RFC 4180', () => {
    const out = formatOutput([{ label: 'say "hi"' }], 'csv')
    const lines = out.split('\n')
    expect(lines[1]).toBe('"say ""hi"""')
  })

  test('empty array returns empty string', () => {
    expect(formatOutput([], 'csv')).toBe('')
  })
})

describe('formatOutput — yaml', () => {
  test('single object serialises as yaml map', () => {
    const out = formatOutput({ key: 'val' }, 'yaml')
    expect(out).toContain('key: val')
  })

  test('array serialises as yaml sequence', () => {
    const out = formatOutput(ROWS, 'yaml')
    expect(out).toContain('- ip: 192.168.1.1')
    expect(out).toContain('- ip: 192.168.1.2')
  })
})

describe('formatOutput — table (default)', () => {
  test('contains header values', () => {
    const out = formatOutput(ROWS, 'table')
    expect(out).toContain('ip')
    expect(out).toContain('model')
    expect(out).toContain('firmware')
  })

  test('contains data values', () => {
    const out = formatOutput(ROWS, 'table')
    expect(out).toContain('192.168.1.1')
    expect(out).toContain('Q6135')
  })

  test('unknown format falls through to table', () => {
    const out = formatOutput(ROWS, 'unknown-fmt')
    expect(out).toContain('ip')
  })

  test('empty array returns no-data string', () => {
    expect(formatOutput([], 'table')).toBe('(no data)')
  })
})
