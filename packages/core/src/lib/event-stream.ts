import { digestFetch } from './digest-auth.js'

// ---- Types -----------------------------------------------------------------

export interface AoaEvent {
  topic: string
  timestamp: number
  triggerTime: string
  scenarioId: number
  scenarioType: string
  objectId: string
  classTypes: string
  active: boolean
}

export interface StreamOptions {
  topicFilters?: string[]
  onEvent: (event: AoaEvent) => void
  onError?: (err: Error) => void
  signal?: AbortSignal
}

// ---- Session token ---------------------------------------------------------

async function getSessionToken(host: string, username: string, password: string): Promise<string> {
  const r = await digestFetch(`http://${host}/axis-cgi/wssession.cgi`, 'GET', username, password)
  if (!r.ok) throw new Error(`wssession failed: ${r.status}`)
  return (await r.text()).trim()
}

// ---- Topic parsing ---------------------------------------------------------

function parseScenarioId(topic: string): number {
  const m = topic.match(/Scenario(\d+)$/)
  return m ? parseInt(m[1]!) : 0
}

function parseEvent(notification: Record<string, unknown>): AoaEvent | null {
  const topic = notification.topic as string
  const timestamp = notification.timestamp as number
  const msg = (notification.message as { data?: Record<string, string> })?.data
  if (!msg) return null

  return {
    topic,
    timestamp,
    triggerTime: msg.triggerTime ?? new Date(timestamp).toISOString(),
    scenarioId: parseScenarioId(topic),
    scenarioType: msg.scenarioType ?? 'unknown',
    objectId: msg.objectId ?? '',
    classTypes: msg.classTypes ?? '',
    active: msg.active === '1',
  }
}

// ---- Main stream function --------------------------------------------------

export async function streamEvents(
  host: string,
  username: string,
  password: string,
  opts: StreamOptions
): Promise<void> {
  const token = await getSessionToken(host, username, password)
  const url = `ws://${host}/vapix/ws-data-stream?wssession=${token}&sources=events`

  const topicFilters = opts.topicFilters ?? [
    'tnsaxis:CameraApplicationPlatform/ObjectAnalytics',
  ]

  const ws = new WebSocket(url)

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      try { ws.close() } catch {}
      resolve()
    }

    opts.signal?.addEventListener('abort', cleanup)

    ws.onopen = () => {
      ws.send(JSON.stringify({
        apiVersion: '1.0',
        method: 'events:configure',
        params: {
          eventFilterList: topicFilters.map((topicFilter) => ({ topicFilter })),
        },
      }))
    }

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string) as {
          method?: string
          error?: { code: number; message: string }
          params?: { notification?: Record<string, unknown> }
        }

        if (data.error) {
          opts.onError?.(new Error(`WS error ${data.error.code}: ${data.error.message}`))
          cleanup()
          return
        }

        if (data.method === 'events:notify' && data.params?.notification) {
          const event = parseEvent(data.params.notification)
          if (event) opts.onEvent(event)
        }
      } catch (e) {
        opts.onError?.(e instanceof Error ? e : new Error(String(e)))
      }
    }

    ws.onerror = () => {
      reject(new Error('WebSocket connection failed'))
    }

    ws.onclose = () => resolve()
  })
}

// Topic builder for specific scenarios
export function aoaTopics(scenarioIds: number[]): string[] {
  return scenarioIds.map((id) => `tnsaxis:CameraApplicationPlatform/ObjectAnalytics/Device1Scenario${id}`)
}
