import { digestFetch } from './digest-auth.js'
import { telemetry } from './telemetry.js'

export interface DeviceProperties {
  Model: string
  ProdNbr: string
  ProdShortName: string
  ProdFullName: string
  ProdVariant: string
  ProdType: string
  ProdHW: string
  ProdSerialNumber: string
  Version: string
  BuildDate: string
  HardwareID: string
  WebURL: string
  [key: string]: string
}

export class VapixClient {
  readonly baseUrl: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.baseUrl = `http://${host}`
  }

  async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const start = performance.now()
    let res: Response
    try {
      res = await digestFetch(url, 'GET', this.username, this.password)
    } catch (err) {
      telemetry.recordVapixCall({
        device_ip: this.host, endpoint: path, method: 'GET',
        status_code: 0, latency_ms: performance.now() - start,
        response_bytes: 0, auth_retries: 0,
        error: (err as Error).message,
      })
      throw err
    }
    const text = await res.text()
    telemetry.recordVapixCall({
      device_ip: this.host, endpoint: path, method: 'GET',
      status_code: res.status, latency_ms: performance.now() - start,
      response_bytes: text.length, auth_retries: 0,
    })
    if (!res.ok) throw new Error(`VAPIX GET ${path} → ${res.status} ${res.statusText}`)
    try { return JSON.parse(text) } catch { return text }
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const payload = JSON.stringify(body)
    const start = performance.now()
    let res: Response
    try {
      res = await digestFetch(url, 'POST', this.username, this.password, payload)
    } catch (err) {
      telemetry.recordVapixCall({
        device_ip: this.host, endpoint: path, method: 'POST',
        status_code: 0, latency_ms: performance.now() - start,
        response_bytes: 0, auth_retries: 0,
        error: (err as Error).message,
      })
      throw err
    }
    const text = await res.text()
    telemetry.recordVapixCall({
      device_ip: this.host, endpoint: path, method: 'POST',
      status_code: res.status, latency_ms: performance.now() - start,
      response_bytes: text.length, auth_retries: 0,
    })
    if (!res.ok) throw new Error(`VAPIX POST ${path} → ${res.status} ${res.statusText}`)
    try { return JSON.parse(text) } catch { return text }
  }

  // Basic Device Information API (VAPIX — POST required)
  async getDeviceInfo(): Promise<DeviceProperties> {
    const res = await this.post('/axis-cgi/basicdeviceinfo.cgi', {
      apiVersion: '1.0',
      method: 'getAllProperties',
    }) as { data?: { propertyList?: DeviceProperties } }
    return res?.data?.propertyList ?? ({} as DeviceProperties)
  }

  // Legacy param API — returns all properties as key=value pairs
  async getAllProperties(): Promise<Record<string, string>> {
    const text = await this.get('/axis-cgi/param.cgi?action=list') as string
    const props: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        props[line.substring(0, eq).trim()] = line.substring(eq + 1).trim()
      }
    }
    return props
  }

  // Firmware version shortcut
  async getFirmwareVersion(): Promise<string> {
    const info = await this.getDeviceInfo()
    return info.Version ?? 'unknown'
  }

  // Check if device is reachable
  async ping(): Promise<boolean> {
    try {
      await this.getDeviceInfo()
      return true
    } catch {
      return false
    }
  }
}
