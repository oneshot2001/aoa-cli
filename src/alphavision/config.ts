import Conf from 'conf'

export interface AlphaVisionConfig {
  apiUrl: string
  apiKey: string
  orgId?: string
  ingestEndpoint?: string
  syncInterval?: number
}

const store = new Conf<{ alphavision: AlphaVisionConfig | null }>({
  projectName: 'axctl',
  schema: {
    alphavision: {
      type: ['object', 'null'],
      default: null,
    },
  },
})

export const avConfigStore = {
  get(): AlphaVisionConfig | null {
    return store.get('alphavision', null)
  },

  set(config: AlphaVisionConfig): void {
    store.set('alphavision', config)
  },

  clear(): void {
    store.set('alphavision', null)
  },

  isConfigured(): boolean {
    const cfg = store.get('alphavision', null)
    return cfg !== null && !!cfg.apiUrl && !!cfg.apiKey
  },

  /** Resolve the ingest endpoint — custom override or default from apiUrl */
  getIngestEndpoint(): string {
    const cfg = store.get('alphavision', null)
    if (!cfg) throw new Error('AlphaVision not configured. Run: axctl av setup')
    return cfg.ingestEndpoint ?? `${cfg.apiUrl}/v1/events/ingest`
  },

  /** Resolve the sync interval in seconds (default 300) */
  getSyncInterval(): number {
    const cfg = store.get('alphavision', null)
    return cfg?.syncInterval ?? 300
  },
}
