import { describe, it, expect } from 'bun:test'
import { spawnSync } from 'child_process'

describe('axctl', () => {
  it('outputs version string', () => {
    const result = spawnSync('bun', ['run', 'packages/cli/src/index.ts', '--version'], {
      cwd: '/Users/matthewvisher/Documents/axctl',
      encoding: 'utf8',
    })
    expect(result.stdout.trim()).toBe('0.1.0')
  })

  it('outputs help with expected commands', () => {
    const result = spawnSync('bun', ['run', 'packages/cli/src/index.ts', '--help'], {
      cwd: '/Users/matthewvisher/Documents/axctl',
      encoding: 'utf8',
    })
    expect(result.stdout).toContain('axctl')
    expect(result.stdout).toContain('--format')
    expect(result.stdout).toContain('--verbose')
  })
})
