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
    // Firmware management API only returns activeFirmwareVersion — not model/serial/build.
    // We supplement with basicdeviceinfo for the full picture.
    const fwBody = JSON.stringify({ apiVersion: '1.0', method: 'status' })
    const fwUrl = `${this.baseUrl}/axis-cgi/firmwaremanagement.cgi`
    const fwRes = await digestFetch(fwUrl, 'POST', this.username, this.password, fwBody)
    if (!fwRes.ok) throw new Error(`Firmware status error: ${fwRes.status}`)
    const fwJson = (await fwRes.json()) as {
      data?: {
        activeFirmwareVersion?: string
        firmwareVersion?: string
        activeFirmwarePart?: string
        [key: string]: unknown
      }
      error?: { code: string; message: string }
    }
    if (fwJson.error) throw new Error(`Firmware error: ${fwJson.error.message}`)

    const fwVersion = fwJson.data?.activeFirmwareVersion
      ?? fwJson.data?.firmwareVersion
      ?? 'unknown'

    // Get model, serial, build date from basicdeviceinfo
    const infoBody = JSON.stringify({ apiVersion: '1.0', method: 'getAllProperties' })
    const infoUrl = `${this.baseUrl}/axis-cgi/basicdeviceinfo.cgi`
    let modelName = 'unknown'
    let serialNumber = 'unknown'
    let buildDate = 'unknown'
    try {
      const infoRes = await digestFetch(infoUrl, 'POST', this.username, this.password, infoBody)
      if (infoRes.ok) {
        const infoJson = (await infoRes.json()) as {
          data?: { propertyList?: { ProdFullName?: string; ProdSerialNumber?: string; BuildDate?: string } }
        }
        const props = infoJson?.data?.propertyList as Record<string, string> | undefined
        modelName = props?.ProdFullName ?? 'unknown'
        serialNumber = props?.SerialNumber ?? props?.ProdSerialNumber ?? 'unknown'
        buildDate = props?.BuildDate ?? 'unknown'
      }
    } catch {
      // Non-fatal — return what we have from firmware API
    }

    return { firmwareVersion: fwVersion, modelName, buildDate, serialNumber }
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

  /** Poll systemready API until device is back online after reboot. */
  async waitForReady(timeoutMs = 300_000, pollIntervalMs = 5_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const url = `${this.baseUrl}/axis-cgi/systemready.cgi`
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          const text = await res.text()
          if (text.includes('"yes"') || text.includes('systemready')) return true
        }
      } catch {
        // Device is rebooting — connection refused is expected
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }
    return false
  }

  /** Factory-reset the device. "soft" preserves network settings, "hard" resets everything. */
  async factoryDefault(mode: 'soft' | 'hard' = 'soft'): Promise<boolean> {
    const body = JSON.stringify({
      apiVersion: '1.0',
      method: 'factoryDefault',
      params: { mode },
    })
    const url = `${this.baseUrl}/axis-cgi/firmwaremanagement.cgi`
    const res = await digestFetch(url, 'POST', this.username, this.password, body)
    return res.ok
  }
}
