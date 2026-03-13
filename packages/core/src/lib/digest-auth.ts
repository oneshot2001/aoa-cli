import { createHash } from 'crypto'
import { ConnectionError, TimeoutError } from './errors.js'

interface DigestChallenge {
  realm: string
  nonce: string
  algorithm: string
  qop?: string
  opaque?: string
}

function parseChallenge(wwwAuthenticate: string): DigestChallenge {
  const fields: Record<string, string> = {}
  const re = /(\w+)="([^"]+)"/g
  let match
  while ((match = re.exec(wwwAuthenticate)) !== null) {
    if (match[1] && match[2]) fields[match[1]] = match[2]
  }
  return {
    realm: fields.realm ?? '',
    nonce: fields.nonce ?? '',
    algorithm: fields.algorithm ?? 'MD5',
    qop: fields.qop,
    opaque: fields.opaque,
  }
}

function md5(data: string): string {
  return createHash('md5').update(data).digest('hex')
}

export function buildDigestHeader(
  method: string,
  uri: string,
  username: string,
  password: string,
  challenge: DigestChallenge,
  nc = 1
): string {
  const ha1 = md5(`${username}:${challenge.realm}:${password}`)
  const ha2 = md5(`${method}:${uri}`)
  const ncHex = nc.toString(16).padStart(8, '0')
  const cnonce = Math.random().toString(36).substring(2, 10)

  let response: string
  if (challenge.qop === 'auth') {
    response = md5(`${ha1}:${challenge.nonce}:${ncHex}:${cnonce}:auth:${ha2}`)
  } else {
    response = md5(`${ha1}:${challenge.nonce}:${ha2}`)
  }

  let header = `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${response}"`
  if (challenge.qop === 'auth') {
    header += `, qop=auth, nc=${ncHex}, cnonce="${cnonce}"`
  }
  if (challenge.opaque) {
    header += `, opaque="${challenge.opaque}"`
  }
  return header
}

export async function digestFetch(
  url: string,
  method: string,
  username: string,
  password: string,
  body?: string,
  timeoutMs = 15000
): Promise<Response> {
  const host = new URL(url).hostname

  const timedFetch = async (init: RequestInit): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new TimeoutError(host, timeoutMs)
      }
      throw new ConnectionError(host, err)
    } finally {
      clearTimeout(timer)
    }
  }

  // First request — no auth
  const res401 = await timedFetch({ method, body })

  if (res401.status !== 401) return res401

  const wwwAuth = res401.headers.get('www-authenticate')
  if (!wwwAuth) throw new Error('401 but no WWW-Authenticate header')

  const challenge = parseChallenge(wwwAuth)
  const urlPath = new URL(url).pathname + new URL(url).search
  const authHeader = buildDigestHeader(method, urlPath, username, password, challenge)

  return timedFetch({
    method,
    body,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
  })
}
