import type { AlphaVisionConfig } from './config.js'
import type { AoaEvent } from '../lib/event-stream.js'
import { getHeaders } from './auth.js'
import { avConfigStore } from './config.js'
import { streamEvents } from '../lib/event-stream.js'
import { credentialStore } from '../lib/credential-store.js'
import { fleetStore } from '../lib/fleet-store.js'

// ---- AlphaVision event schema ------------------------------------------------

export interface AlphaVisionEvent {
  sourceId: string
  timestamp: string
  scenarioId: number
  scenarioName: string
  type: string
  objectClass: string
  active: boolean
  metadata: Record<string, unknown>
}

// ---- Event mapping -----------------------------------------------------------

function mapEvent(sourceId: string, event: AoaEvent): AlphaVisionEvent {
  return {
    sourceId,
    timestamp: event.triggerTime || new Date(event.timestamp).toISOString(),
    scenarioId: event.scenarioId,
    scenarioName: `Scenario${event.scenarioId}`,
    type: event.scenarioType,
    objectClass: event.classTypes,
    active: event.active,
    metadata: {
      topic: event.topic,
      objectId: event.objectId,
      rawTimestamp: event.timestamp,
    },
  }
}

// ---- Retry helper ------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3
): Promise<Response> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res
      // Non-retryable client errors (except 429)
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`Ingest failed: HTTP ${res.status} ${res.statusText}`)
      }
      lastError = new Error(`Ingest HTTP ${res.status}`)
    } catch (err) {
      lastError = err as Error
    }
    // Exponential backoff: 500ms, 1000ms, 2000ms
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)))
    }
  }
  throw lastError ?? new Error('Ingest failed after retries')
}

// ---- Ingest client -----------------------------------------------------------

export class EventIngestClient {
  private buffer: AlphaVisionEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private readonly endpoint: string
  private readonly headers: Record<string, string>

  constructor(
    private config: AlphaVisionConfig,
    private batchSize = 10,
    private flushIntervalMs = 1000
  ) {
    this.endpoint = config.ingestEndpoint ?? `${config.apiUrl}/v1/events/ingest`
    this.headers = getHeaders(config)
  }

  /** Push a single event into the buffer — auto-flushes at batchSize */
  push(event: AlphaVisionEvent): void {
    this.buffer.push(event)
    if (this.buffer.length >= this.batchSize) {
      void this.flush()
    }
  }

  /** Start the periodic flush timer */
  start(): void {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) void this.flush()
    }, this.flushIntervalMs)
  }

  /** Stop the timer and flush remaining events */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    if (this.buffer.length > 0) {
      await this.flush()
    }
  }

  /** Flush all buffered events to the ingest endpoint */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const batch = this.buffer.splice(0)
    await fetchWithRetry(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ events: batch }),
    })
  }
}

// ---- High-level ingestion starters -------------------------------------------

export interface IngestionHandle {
  abort: () => void
  client: EventIngestClient
}

/** Connect a single camera's event stream to AlphaVision ingest */
export async function startIngestion(
  host: string,
  username: string,
  password: string,
  config: AlphaVisionConfig,
  opts?: { onEvent?: (e: AlphaVisionEvent) => void; onError?: (err: Error) => void }
): Promise<IngestionHandle> {
  const client = new EventIngestClient(config)
  client.start()

  const ac = new AbortController()

  const streamPromise = streamEvents(host, username, password, {
    signal: ac.signal,
    onEvent: (event) => {
      const mapped = mapEvent(host, event)
      client.push(mapped)
      opts?.onEvent?.(mapped)
    },
    onError: (err) => {
      opts?.onError?.(err)
    },
  })

  // Don't await — let it run in background
  streamPromise.catch((err) => {
    if ((err as Error).name !== 'AbortError') {
      opts?.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  })

  return {
    abort: () => {
      ac.abort()
      void client.stop()
    },
    client,
  }
}

/** Connect all cameras in a fleet to AlphaVision ingest */
export async function startFleetIngestion(
  fleetName: string,
  config: AlphaVisionConfig,
  opts?: { onEvent?: (e: AlphaVisionEvent) => void; onError?: (err: Error) => void }
): Promise<IngestionHandle[]> {
  const fleet = fleetStore.get(fleetName)
  if (!fleet) throw new Error(`Fleet "${fleetName}" not found`)

  const handles: IngestionHandle[] = []

  for (const ip of fleet.ips) {
    const cred = credentialStore.get(ip)
    if (!cred) {
      opts?.onError?.(new Error(`No credentials for ${ip} — skipping`))
      continue
    }

    const handle = await startIngestion(ip, cred.username, cred.password, config, opts)
    handles.push(handle)
  }

  return handles
}
