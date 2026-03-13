import { configRegistry } from '../storage/registry.js'

export interface AlphaVisionConfig {
  apiUrl: string
  apiKey: string
  orgId?: string
  ingestEndpoint?: string
  syncInterval?: number
}

const CONFIG_KEY = 'alphavision'

export const avConfigStore = {
  get(): AlphaVisionConfig | null {
    const raw = configRegistry.get(CONFIG_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AlphaVisionConfig
    } catch {
      return null
    }
  },

  set(config: AlphaVisionConfig): void {
    configRegistry.set(CONFIG_KEY, JSON.stringify(config))
  },

  clear(): void {
    configRegistry.delete(CONFIG_KEY)
  },

  isConfigured(): boolean {
    const cfg = this.get()
    return cfg !== null && !!cfg.apiUrl && !!cfg.apiKey
  },

  /** Resolve the ingest endpoint — custom override or default from apiUrl */
  getIngestEndpoint(): string {
    const cfg = this.get()
    if (!cfg) throw new Error('AlphaVision not configured. Run: axctl av setup')
    return cfg.ingestEndpoint ?? `${cfg.apiUrl}/v1/events/ingest`
  },

  /** Resolve the sync interval in seconds (default 300) */
  getSyncInterval(): number {
    const cfg = this.get()
    return cfg?.syncInterval ?? 300
  },
}
