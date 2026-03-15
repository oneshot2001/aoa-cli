/**
 * AXIS Image Health Analytics (AIHA) VAPIX client.
 *
 * Uses the Application Configuration API (/axis-cgi/vaconfig.cgi) for config read/write
 * and the Application Control API (/axis-cgi/applications/control.cgi) for restart.
 *
 * NOTE: The exact XML parameter schema from vaconfig.cgi must be verified against real
 * hardware. This implementation uses the documented API pattern with best-guess parameter
 * names. Adjustments may be needed after Day 6 hardware verification.
 */
import { digestFetch } from './digest-auth.js'
import { telemetry } from './telemetry.js'
import { appsClient } from './apps-client.js'
import type {
  ImageHealthConfiguration,
  ImageHealthDetectionConfig,
  ImageHealthDetectionType,
  ImageHealthStatus,
  ImageHealthAlert,
  ImageHealthEvent,
} from '../types/image-health.js'
import { IMAGE_HEALTH_DEFAULTS, IMAGE_HEALTH_DETECTION_TYPES } from '../types/image-health.js'

const AIHA_PACKAGE = 'imagehealth'
const VACONFIG_PATH = '/axis-cgi/vaconfig.cgi'
const AIHA_CONFIG_NAME = 'ImageHealthAnalytics'

// ---- XML parsing helpers (vaconfig returns XML) -----------------------------

function parseDetectionFromXml(xml: string, type: string): ImageHealthDetectionConfig {
  // Expected XML shape per detection:
  //   <detection type="blocked" enabled="true" sensitivity="50" validationPeriod="120"/>
  // or nested:
  //   <detection type="blocked">
  //     <enabled>true</enabled>
  //     <sensitivity>50</sensitivity>
  //     <validationPeriod>120</validationPeriod>
  //   </detection>
  const defaults = IMAGE_HEALTH_DEFAULTS[type as ImageHealthDetectionType]

  // Try attribute-based first
  const attrRe = new RegExp(
    `<detection[^>]*type=["']${type}["'][^>]*>`,
    'i'
  )
  const attrMatch = xml.match(attrRe)
  if (attrMatch) {
    const tag = attrMatch[0]
    const getAttr = (name: string) => {
      const m = tag.match(new RegExp(`${name}=["']([^"']+)["']`))
      return m?.[1]
    }
    return {
      enabled: getAttr('enabled') !== 'false',
      sensitivity: parseInt(getAttr('sensitivity') ?? '') || defaults.sensitivity,
      validationPeriod: parseInt(getAttr('validationPeriod') ?? '') || defaults.validationPeriod,
    }
  }

  // Try nested element-based
  const blockRe = new RegExp(
    `<detection[^>]*type=["']${type}["'][^>]*>([\\s\\S]*?)</detection>`,
    'i'
  )
  const blockMatch = xml.match(blockRe)
  if (blockMatch) {
    const inner = blockMatch[1]!
    const getEl = (name: string) => {
      const m = inner.match(new RegExp(`<${name}>([^<]+)</${name}>`))
      return m?.[1]
    }
    return {
      enabled: getEl('enabled') !== 'false',
      sensitivity: parseInt(getEl('sensitivity') ?? '') || defaults.sensitivity,
      validationPeriod: parseInt(getEl('validationPeriod') ?? '') || defaults.validationPeriod,
    }
  }

  // Fallback: try param.cgi style key=value pairs
  // ImageHealth.Blocked.Enabled=true
  const prefix = `ImageHealth.${type.charAt(0).toUpperCase() + type.slice(1)}`
  const getParam = (key: string) => {
    const m = xml.match(new RegExp(`${prefix}\\.${key}=(.+)`, 'im'))
    return m?.[1]?.trim()
  }
  const paramEnabled = getParam('Enabled')
  if (paramEnabled !== undefined) {
    return {
      enabled: paramEnabled !== 'false' && paramEnabled !== '0',
      sensitivity: parseInt(getParam('Sensitivity') ?? '') || defaults.sensitivity,
      validationPeriod: parseInt(getParam('ValidationPeriod') ?? '') || defaults.validationPeriod,
    }
  }

  return defaults
}

function buildConfigXml(config: ImageHealthConfiguration): string {
  const detections = IMAGE_HEALTH_DETECTION_TYPES.map((type) => {
    const d = config[type]
    return `    <detection type="${type}" enabled="${d.enabled}" sensitivity="${d.sensitivity}" validationPeriod="${d.validationPeriod}"/>`
  }).join('\n')

  return `<config version="1.0">
  <application name="${AIHA_CONFIG_NAME}">
${detections}
  </application>
</config>`
}

// ---- Client ----------------------------------------------------------------

export class AihaClient {
  private readonly baseUrl: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string,
  ) {
    this.baseUrl = `http://${host}`
  }

  /** Read current AIHA configuration from the camera */
  async getConfiguration(): Promise<ImageHealthConfiguration> {
    const url = `${this.baseUrl}${VACONFIG_PATH}?action=get&name=${AIHA_CONFIG_NAME}`
    const start = performance.now()
    let res: Response
    try {
      res = await digestFetch(url, 'GET', this.username, this.password)
    } catch (err) {
      telemetry.recordVapixCall({
        device_ip: this.host, endpoint: VACONFIG_PATH, method: 'GET',
        status_code: 0, latency_ms: performance.now() - start,
        response_bytes: 0, auth_retries: 0,
        error: (err as Error).message,
      })
      throw err
    }
    const text = await res.text()
    telemetry.recordVapixCall({
      device_ip: this.host, endpoint: VACONFIG_PATH, method: 'GET',
      status_code: res.status, latency_ms: performance.now() - start,
      response_bytes: text.length, auth_retries: 0,
    })
    if (!res.ok) throw new Error(`AIHA config read failed: ${res.status}`)

    return {
      blocked: parseDetectionFromXml(text, 'blocked'),
      redirected: parseDetectionFromXml(text, 'redirected'),
      blurred: parseDetectionFromXml(text, 'blurred'),
      underexposed: parseDetectionFromXml(text, 'underexposed'),
    }
  }

  /** Write AIHA configuration to the camera */
  async setConfiguration(config: ImageHealthConfiguration): Promise<void> {
    const xml = buildConfigXml(config)
    const body = `action=modify&name=${AIHA_CONFIG_NAME}&${encodeURIComponent(xml)}`
    const url = `${this.baseUrl}${VACONFIG_PATH}`
    const start = performance.now()
    let res: Response
    try {
      res = await digestFetch(url, 'POST', this.username, this.password, body)
    } catch (err) {
      telemetry.recordVapixCall({
        device_ip: this.host, endpoint: VACONFIG_PATH, method: 'POST',
        status_code: 0, latency_ms: performance.now() - start,
        response_bytes: 0, auth_retries: 0,
        error: (err as Error).message,
      })
      throw err
    }
    const text = await res.text()
    telemetry.recordVapixCall({
      device_ip: this.host, endpoint: VACONFIG_PATH, method: 'POST',
      status_code: res.status, latency_ms: performance.now() - start,
      response_bytes: text.length, auth_retries: 0,
    })
    if (!res.ok) throw new Error(`AIHA config write failed: ${res.status} — ${text}`)
  }

  /** Update specific detection settings without overwriting others */
  async updateDetection(
    type: ImageHealthDetectionType,
    changes: Partial<ImageHealthDetectionConfig>,
  ): Promise<ImageHealthConfiguration> {
    const config = await this.getConfiguration()
    config[type] = { ...config[type], ...changes }
    await this.setConfiguration(config)
    return config
  }

  /** Get AIHA running status, scene suitability, and active alerts */
  async getStatus(): Promise<ImageHealthStatus> {
    // Check if AIHA app is running
    const apps = await appsClient.list(this.host, this.username, this.password)
    const aiha = apps.find((a) =>
      a.name.toLowerCase().includes('imagehealth') ||
      a.name.toLowerCase().includes('image_health') ||
      a.niceName.toLowerCase().includes('image health')
    )

    const running = aiha?.status === 'Running'
    const version = aiha?.version

    // If running, try to get active alerts from config/status
    const alerts: ImageHealthAlert[] = []
    let sceneSuitable = true

    if (running) {
      try {
        // Try to read status via param.cgi for active alerts
        const url = `${this.baseUrl}/axis-cgi/param.cgi?action=list&group=ImageHealth`
        const start = performance.now()
        const res = await digestFetch(url, 'GET', this.username, this.password)
        const text = await res.text()
        telemetry.recordVapixCall({
          device_ip: this.host, endpoint: '/axis-cgi/param.cgi', method: 'GET',
          status_code: res.status, latency_ms: performance.now() - start,
          response_bytes: text.length, auth_retries: 0,
        })

        // Parse any active alert state from params
        for (const type of IMAGE_HEALTH_DETECTION_TYPES) {
          const key = type.charAt(0).toUpperCase() + type.slice(1)
          const activeMatch = text.match(new RegExp(`ImageHealth\\.${key}\\.Active=(\\w+)`, 'i'))
          if (activeMatch) {
            const active = activeMatch[1] === 'true' || activeMatch[1] === '1'
            alerts.push({ type, active })
          }
        }

        // Check scene suitability
        const suitableMatch = text.match(/ImageHealth\.SceneSuitable=(\w+)/i)
        if (suitableMatch) {
          sceneSuitable = suitableMatch[1] !== 'false' && suitableMatch[1] !== '0'
        }
      } catch {
        // param.cgi may not expose this — degrade gracefully
      }
    }

    return { running, version, sceneSuitable, alerts }
  }

  /** Restart AIHA application (forces scene relearn) */
  async restart(): Promise<void> {
    // Find the exact package name
    const apps = await appsClient.list(this.host, this.username, this.password)
    const aiha = apps.find((a) =>
      a.name.toLowerCase().includes('imagehealth') ||
      a.name.toLowerCase().includes('image_health') ||
      a.niceName.toLowerCase().includes('image health')
    )
    const pkg = aiha?.name ?? AIHA_PACKAGE

    try {
      await appsClient.stop(this.host, this.username, this.password, pkg)
    } catch {
      // May already be stopped
    }
    // Brief pause for clean shutdown
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await appsClient.start(this.host, this.username, this.password, pkg)
  }

  /** Check if AIHA is available on this camera (AXIS OS >= 12.0) */
  async isAvailable(): Promise<boolean> {
    try {
      const apps = await appsClient.list(this.host, this.username, this.password)
      return apps.some((a) =>
        a.name.toLowerCase().includes('imagehealth') ||
        a.name.toLowerCase().includes('image_health') ||
        a.niceName.toLowerCase().includes('image health')
      )
    } catch {
      return false
    }
  }
}
