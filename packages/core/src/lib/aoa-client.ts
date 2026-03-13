import { buildDigestHeader } from './digest-auth.js'

// ---- Types -----------------------------------------------------------------

export interface AoaDevice {
  id: number
  isActive: boolean
  rotation: number
  type: string
}

export interface AoaFilter {
  type: string
  [key: string]: unknown
}

export interface AoaTrigger {
  type: string
  vertices?: [number, number][]
  alarmDirection?: string
  countingDirection?: string
  [key: string]: unknown
}

export interface AoaObjectClass {
  type: string
  subTypes?: { type: string }[]
}

export interface AoaScenario {
  id: number
  name: string
  type: string
  devices: { id: number }[]
  filters: AoaFilter[]
  triggers: AoaTrigger[]
  objectClassifications: AoaObjectClass[]
  metadataOverlay?: number
}

export interface AoaConfiguration {
  devices: AoaDevice[]
  scenarios: AoaScenario[]
  metadataOverlay?: unknown[]
}

export interface CountData {
  resetTime?: string
  timeStamp?: string
  total: number
  totalCar?: number
  totalTruck?: number
  totalBus?: number
  totalBike?: number
  totalHuman?: number
  totalOtherVehicle?: number
  reason?: string
}

export interface OccupancyData {
  timeStamp?: string
  total: number
  car?: number
  truck?: number
  bus?: number
  bike?: number
  human?: number
  otherVehicle?: number
}

// ---- Supported scenario types ----------------------------------------------

export const SCENARIO_TYPES = [
  'motion',
  'fence',
  'crosslinecounting',
  'occupancyInArea',
  'tailgating',
  'fallDetection',
] as const

export type ScenarioType = typeof SCENARIO_TYPES[number]

// Valid object classifications
export const OBJECT_CLASSES = ['human', 'vehicle', 'missing_hardhat'] as const

// Default triggers per scenario type
export function defaultTrigger(type: string): AoaTrigger {
  if (type === 'fence' || type === 'tailgating') {
    return { type: 'fence', alarmDirection: 'leftToRight', vertices: [[0, -0.7], [0, 0.7]] }
  }
  if (type === 'crosslinecounting') {
    return { type: 'countingLine', countingDirection: 'leftToRight', vertices: [[0, -0.7], [0, 0.7]] }
  }
  return { type: 'includeArea', vertices: [[-0.97, -0.97], [-0.97, 0.97], [0.97, 0.97], [0.97, -0.97]] }
}

// Filters valid per scenario type
export function defaultFilters(type: string): AoaFilter[] {
  if (['motion', 'occupancyInArea'].includes(type)) {
    return [
      { type: 'distanceSwayingObject', distance: 5 },
      { type: 'timeShortLivedLimit', time: 1 },
      { type: 'sizePercentage', height: 3, width: 3 },
    ]
  }
  return [] // fence, crosslinecounting, tailgating, fallDetection
}

// ---- Client ----------------------------------------------------------------

export class AoaClient {
  private readonly url: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.url = `http://${host}/local/objectanalytics/control.cgi`
  }

  private async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const body = JSON.stringify({ apiVersion: '1.6', method, ...(params ? { params } : {}) })

    const probe = await fetch(this.url, {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' }
    })

    let res: Response
    if (probe.status === 401) {
      const wwwAuth = probe.headers.get('www-authenticate') ?? ''
      const fields: Record<string, string> = {}
      const re = /(\w+)="([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(wwwAuth)) !== null) fields[m[1]!] = m[2]!
      const challenge = { realm: fields.realm ?? '', nonce: fields.nonce ?? '', algorithm: 'MD5', qop: fields.qop, opaque: fields.opaque }
      const authHeader = buildDigestHeader('POST', '/local/objectanalytics/control.cgi', this.username, this.password, challenge)
      res = await fetch(this.url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Authorization: authHeader } })
    } else {
      res = probe
    }

    if (!res.ok) throw new Error(`AOA HTTP ${res.status}`)
    const json = await res.json() as { data?: unknown; error?: { code: string; message: string } }
    if (json.error) throw new Error(`AOA error ${json.error.code}: ${json.error.message}`)
    return json.data
  }

  // ---- Config reads -------------------------------------------------------

  async getConfiguration(): Promise<AoaConfiguration> {
    return (await this.call('getConfiguration')) as AoaConfiguration
  }

  async getCapabilities(): Promise<Record<string, unknown>> {
    return (await this.call('getConfigurationCapabilities')) as Record<string, unknown>
  }

  async getScenarios(): Promise<AoaScenario[]> {
    return (await this.getConfiguration()).scenarios ?? []
  }

  async getDevices(): Promise<AoaDevice[]> {
    return (await this.getConfiguration()).devices ?? []
  }

  // ---- Config writes -------------------------------------------------------

  async setConfiguration(config: AoaConfiguration): Promise<void> {
    await this.call('setConfiguration', config as unknown as Record<string, unknown>)
  }

  async addScenario(
    name: string,
    type: string,
    deviceId = 1,
    objects: string[] = ['human', 'vehicle']
  ): Promise<AoaScenario> {
    const config = await this.getConfiguration()
    const nextId = Math.max(0, ...config.scenarios.map((s) => s.id)) + 1

    const objectClassifications: AoaObjectClass[] = objects.map((o) => {
      if (o === 'vehicle') {
        return { type: 'vehicle', subTypes: [{ type: 'bus' }, { type: 'car' }, { type: 'motorcycle/bicycle' }, { type: 'truck' }, { type: 'unknown' }] }
      }
      return { type: o }
    })

    const scenario: AoaScenario = {
      id: nextId,
      name,
      type,
      devices: [{ id: deviceId }],
      filters: defaultFilters(type),
      triggers: [defaultTrigger(type)],
      objectClassifications,
      metadataOverlay: (config.metadataOverlay?.[0] as { id?: number } | undefined)?.id,
    }

    config.scenarios.push(scenario)
    await this.setConfiguration(config)
    return scenario
  }

  async removeScenario(id: number): Promise<void> {
    const config = await this.getConfiguration()
    const before = config.scenarios.length
    config.scenarios = config.scenarios.filter((s) => s.id !== id)
    if (config.scenarios.length === before) throw new Error(`Scenario ${id} not found`)
    await this.setConfiguration(config)
  }

  async updateScenarioName(id: number, name: string): Promise<void> {
    const config = await this.getConfiguration()
    const s = config.scenarios.find((s) => s.id === id)
    if (!s) throw new Error(`Scenario ${id} not found`)
    s.name = name
    await this.setConfiguration(config)
  }

  // ---- Data & actions ------------------------------------------------------

  async sendAlarmEvent(scenarioId: number): Promise<void> {
    await this.call('sendAlarmEvent', { scenario: scenarioId })
  }

  async getAccumulatedCounts(scenarioId: number): Promise<CountData> {
    return (await this.call('getAccumulatedCounts', { scenario: scenarioId })) as CountData
  }

  async getOccupancy(scenarioId: number): Promise<OccupancyData> {
    return (await this.call('getOccupancy', { scenario: scenarioId })) as OccupancyData
  }

  async resetAccumulatedCounts(scenarioId: number): Promise<void> {
    await this.call('resetAccumulatedCounts', { scenario: scenarioId })
  }

  // ---- Export / Import -------------------------------------------------------

  async exportConfiguration(): Promise<AoaConfiguration> {
    return this.getConfiguration()
  }

  async importConfiguration(config: AoaConfiguration): Promise<void> {
    await this.setConfiguration(config)
  }
}
