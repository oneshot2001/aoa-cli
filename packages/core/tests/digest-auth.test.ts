import { describe, test, expect, spyOn } from 'bun:test'
import { buildDigestHeader } from '../src/lib/digest-auth.js'

// Known-good MD5: MD5("hello") = "5d41402abc4b2a76b9719d911017c592"
// We test structural shape + qop branching, not the exact hash value
// (since cnonce is random per call)

describe('buildDigestHeader', () => {
  const challenge = {
    realm: 'AXIS_ACCC8E012345',
    nonce: 'abc123def456',
    algorithm: 'MD5',
    qop: undefined as string | undefined,
    opaque: undefined as string | undefined,
  }

  test('contains all required Digest fields', () => {
    const header = buildDigestHeader('GET', '/axis-cgi/param.cgi', 'root', 'pass', challenge)
    expect(header).toContain('Digest username="root"')
    expect(header).toContain('realm="AXIS_ACCC8E012345"')
    expect(header).toContain('nonce="abc123def456"')
    expect(header).toContain('uri="/axis-cgi/param.cgi"')
    expect(header).toContain('response="')
  })

  test('without qop — no nc/cnonce in header', () => {
    const header = buildDigestHeader('GET', '/test', 'user', 'pw', { ...challenge, qop: undefined })
    expect(header).not.toContain('qop=')
    expect(header).not.toContain('nc=')
    expect(header).not.toContain('cnonce=')
  })

  test('with qop=auth — includes nc, cnonce, qop=auth', () => {
    const header = buildDigestHeader('POST', '/test', 'root', 'pass', { ...challenge, qop: 'auth' })
    expect(header).toContain('qop=auth')
    expect(header).toContain('nc=00000001')
    expect(header).toContain('cnonce="')
  })

  test('with opaque — appended to header', () => {
    const header = buildDigestHeader('GET', '/test', 'root', 'pass', { ...challenge, opaque: 'opq999' })
    expect(header).toContain('opaque="opq999"')
  })

  test('different methods produce different response hashes', () => {
    // Spy on Math.random so cnonce is deterministic
    const spy = spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      const get = buildDigestHeader('GET', '/x', 'u', 'p', { ...challenge, qop: 'auth' })
      const post = buildDigestHeader('POST', '/x', 'u', 'p', { ...challenge, qop: 'auth' })
      // Extract response="..." from each
      const getResp = get.match(/response="([^"]+)"/)?.[1]
      const postResp = post.match(/response="([^"]+)"/)?.[1]
      expect(getResp).toBeDefined()
      expect(postResp).toBeDefined()
      expect(getResp).not.toBe(postResp)
    } finally {
      spy.mockRestore()
    }
  })

  test('nc padding is 8 hex digits', () => {
    const header = buildDigestHeader('GET', '/x', 'u', 'p', { ...challenge, qop: 'auth' }, 255)
    expect(header).toContain('nc=000000ff')
  })
})
