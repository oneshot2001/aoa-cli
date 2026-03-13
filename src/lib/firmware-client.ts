import { readFileSync, statSync } from 'fs'
import { buildDigestHeader, digestFetch } from './digest-auth.js'

export interface FirmwareStatus {
  firmwareVersion: string
  modelName: string
  buildDate: string
  serialNumber: string
}

export class FirmwareClient {
  private readonly baseUrl: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.baseUrl = `http://${host}`
  }

  async getStatus(): Promise<FirmwareStatus> {
    const body = JSON.stringify({ apiVersion: '1.0', method: 'status' })
    const url = `${this.baseUrl}/axis-cgi/firmwaremanagement.cgi`
    const res = await digestFetch(url, 'POST', this.username, this.password, body)
    if (!res.ok) throw new Error(`Firmware status error: ${res.status}`)
    const json = (await res.json()) as {
      data?: FirmwareStatus
      error?: { code: string; message: string }
    }
    if (json.error) throw new Error(`Firmware error: ${json.error.message}`)
    return (
      json.data ?? {
        firmwareVersion: 'unknown',
        modelName: 'unknown',
        buildDate: 'unknown',
        serialNumber: 'unknown',
      }
    )
  }

  /** Returns the firmware file size in bytes (for dry-run display). */
  static fileSize(firmwarePath: string): number {
    return statSync(firmwarePath).size
  }

  async upgrade(firmwarePath: string): Promise<string> {
    const firmware = readFileSync(firmwarePath)
    const filename = firmwarePath.split('/').pop() ?? 'firmware.bin'

    // Build multipart form data manually for digest auth compatibility
    const boundary = '----axctl' + Date.now()
    const preamble = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`,
      `Content-Type: application/octet-stream\r\n\r\n`,
    ].join('')
    const epilogue = `\r\n--${boundary}--\r\n`

    const bodyParts = Buffer.concat([Buffer.from(preamble), firmware, Buffer.from(epilogue)])

    // First request to get digest challenge
    const url = `${this.baseUrl}/axis-cgi/firmwareupgrade.cgi`
    const probe = await fetch(url, { method: 'POST' })

    if (probe.status !== 401) {
      throw new Error(`Unexpected response from firmware endpoint: ${probe.status}`)
    }

    const wwwAuth = probe.headers.get('www-authenticate')
    if (!wwwAuth) throw new Error('No WWW-Authenticate header in 401 response')

    // Parse challenge and build auth header
    const fields: Record<string, string> = {}
    const re = /(\w+)="([^"]+)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(wwwAuth)) !== null) {
      if (m[1] && m[2]) fields[m[1]] = m[2]
    }
    const challenge = {
      realm: fields.realm ?? '',
      nonce: fields.nonce ?? '',
      algorithm: 'MD5',
      qop: fields.qop,
      opaque: fields.opaque,
    }
    const authHeader = buildDigestHeader(
      'POST',
      '/axis-cgi/firmwareupgrade.cgi',
      this.username,
      this.password,
      challenge
    )

    const res = await fetch(url, {
      method: 'POST',
      body: bodyParts,
      headers: {
        Authorization: authHeader,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Firmware upgrade failed: ${res.status} — ${text.substring(0, 200)}`)
    }

    return (await res.text()).trim()
  }
}
