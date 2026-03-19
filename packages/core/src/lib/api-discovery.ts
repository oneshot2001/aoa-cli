import { VapixClient } from './vapix-client.js'

export interface ApiInfo {
  id: string
  version: string
  name: string
  docLink?: string
}

export class ApiDiscoveryClient {
  private vapix: VapixClient

  constructor(host: string, username: string, password: string) {
    this.vapix = new VapixClient(host, username, password)
  }

  async getApis(): Promise<ApiInfo[]> {
    const res = await this.vapix.postJson('/axis-cgi/apidiscovery.cgi', {
      method: 'getApiList',
      apiVersion: '1.0',
    }) as { data?: { apiList?: ApiInfo[] } }
    return res?.data?.apiList ?? []
  }

  async hasApi(apiId: string): Promise<boolean> {
    const apis = await this.getApis()
    return apis.some(a => a.id === apiId)
  }

  async getApiVersion(apiId: string): Promise<string | null> {
    const apis = await this.getApis()
    return apis.find(a => a.id === apiId)?.version ?? null
  }
}

/** Pre-flight check: ensure device supports an API. Throws with helpful message if not. */
export async function requireApi(
  host: string, username: string, password: string,
  apiId: string, minVersion?: string, friendlyName?: string
): Promise<void> {
  const client = new ApiDiscoveryClient(host, username, password)
  const version = await client.getApiVersion(apiId)
  const name = friendlyName ?? apiId

  if (!version) {
    throw new Error(
      `This device does not support the ${name} API. ` +
      `Check firmware version or device capabilities with: axctl api list --device <ip>`
    )
  }

  if (minVersion && compareVersions(version, minVersion) < 0) {
    throw new Error(
      `${name} API requires version ${minVersion}+, but device has ${version}. ` +
      `Consider upgrading firmware with: axctl firmware upgrade`
    )
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
}

// Firmware-native APIs (registered in API Discovery Service)
export const KNOWN_API_IDS = {
  BASIC_DEVICE_INFO: 'basic-device-info',
  FIRMWARE_MANAGER: 'fwmgr',
  PTZ_CONTROL: 'ptz-control',
  STREAM_PROFILES: 'stream-profiles',
  MQTT_CLIENT: 'mqtt-client',
  GUARD_TOUR: 'guard-tour',
  API_DISCOVERY: 'api-discovery',
  PARAM_CGI: 'param-cgi',
  APPLICATION_API: 'application',
  RECORDING: 'recording',
  DISK_MANAGEMENT: 'disk-management',
  ANALYTICS_METADATA: 'analytics-metadata-config',
  AUDIO_ANALYTICS: 'audio-analytics',
  SIGNED_VIDEO: 'signed-video',
} as const

// ACAP-based APIs (NOT in API Discovery — use apps list to check availability)
// These run as installed ACAPs with their own endpoints:
//   - Object Analytics (AOA): /local/objectanalytics/control.cgi
//   - Video Motion Detection (VMD): ACAP, not firmware API
//   - Image Health Analytics: ACAP, not firmware API
// To check ACAP availability, use: axctl apps list <ip>
