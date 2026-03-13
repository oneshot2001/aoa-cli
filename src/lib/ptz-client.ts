import { digestFetch } from './digest-auth.js'

export interface PtzPosition {
  pan: number
  tilt: number
  zoom: number
}

export interface PtzPreset {
  name: string
  position: number
}

export class PtzClient {
  private readonly baseUrl: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.baseUrl = `http://${host}`
  }

  private async cgiGet(params: string): Promise<string> {
    const url = `${this.baseUrl}/axis-cgi/com/ptz.cgi?${params}`
    const res = await digestFetch(url, 'GET', this.username, this.password)
    if (!res.ok) throw new Error(`PTZ error: ${res.status} ${res.statusText}`)
    return (await res.text()).trim()
  }

  async getPosition(): Promise<PtzPosition> {
    const text = await this.cgiGet('query=position')
    // Response: pan=0.0000\ntilt=0.0000\nzoom=1
    const props: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) props[line.substring(0, eq).trim()] = line.substring(eq + 1).trim()
    }
    return {
      pan: parseFloat(props['pan'] ?? '0'),
      tilt: parseFloat(props['tilt'] ?? '0'),
      zoom: parseFloat(props['zoom'] ?? '1'),
    }
  }

  async absoluteMove(pan?: number, tilt?: number, zoom?: number): Promise<void> {
    const params: string[] = []
    if (pan !== undefined) params.push(`pan=${pan}`)
    if (tilt !== undefined) params.push(`tilt=${tilt}`)
    if (zoom !== undefined) params.push(`zoom=${zoom}`)
    if (params.length === 0) throw new Error('Specify at least one of pan, tilt, or zoom')
    await this.cgiGet(params.join('&'))
  }

  async relativeMove(rpan?: number, rtilt?: number, rzoom?: number): Promise<void> {
    const params: string[] = []
    if (rpan !== undefined) params.push(`rpan=${rpan}`)
    if (rtilt !== undefined) params.push(`rtilt=${rtilt}`)
    if (rzoom !== undefined) params.push(`rzoom=${rzoom}`)
    if (params.length === 0) throw new Error('Specify at least one of rpan, rtilt, or rzoom')
    await this.cgiGet(params.join('&'))
  }

  async goHome(): Promise<void> {
    await this.cgiGet('move=home')
  }

  async gotoPreset(name: string): Promise<void> {
    await this.cgiGet(`gotoserverpresetname=${encodeURIComponent(name)}`)
  }

  async listPresets(): Promise<PtzPreset[]> {
    const text = await this.cgiGet('query=presetposall')
    // Response format: presetposno1=name1\npresetposno2=name2\n...
    const presets: PtzPreset[] = []
    for (const line of text.split('\n')) {
      const match = line.match(/presetposno(\d+)=(.+)/)
      if (match) {
        presets.push({ name: match[2]!.trim(), position: parseInt(match[1]!) })
      }
    }
    return presets
  }

  async stop(): Promise<void> {
    await this.cgiGet('continuouspantiltmove=0,0&continuouszoommove=0')
  }
}
