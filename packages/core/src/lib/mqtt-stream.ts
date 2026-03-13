import mqtt from 'mqtt'
import { digestFetch } from './digest-auth.js'
import type { AoaEvent } from './event-stream.js'

export interface MqttStreamOptions {
  topicFilters?: string[]
  onEvent: (event: AoaEvent) => void
  onError?: (err: Error) => void
  signal?: AbortSignal
}

// ---- MQTT config from Analytics MQTT API -----------------------------------

async function getMqttConfig(
  host: string,
  username: string,
  password: string
): Promise<{ broker: string; topics: string[] }> {
  const r = await digestFetch(
    `http://${host}/config/rest/analytics-mqtt/v1beta/data_sources`,
    'GET',
    username,
    password
  )

  if (!r.ok) {
    // Fallback: camera may not support Analytics MQTT API
    // Use the camera's built-in MQTT broker on default port
    return {
      broker: `mqtt://${host}:1883`,
      topics: ['axis:CameraApplicationPlatform/ObjectAnalytics/#'],
    }
  }

  const data = (await r.json()) as {
    data_sources?: { topic?: string; broker_uri?: string }[]
  }
  const sources = data.data_sources ?? []

  return {
    broker: sources[0]?.broker_uri ?? `mqtt://${host}:1883`,
    topics: sources.map((s) => s.topic).filter(Boolean) as string[],
  }
}

// ---- Payload parsing -------------------------------------------------------

function parseMqttEvent(topic: string, payload: Buffer): AoaEvent | null {
  try {
    const data = JSON.parse(payload.toString()) as Record<string, unknown>
    const scenarioMatch = topic.match(/Scenario(\d+)/)
    const scenarioId = scenarioMatch ? parseInt(scenarioMatch[1]!) : 0

    // MQTT analytics events may have different structure than WebSocket
    const msg =
      (data.message as { data?: Record<string, string> })?.data ??
      (data as Record<string, string>)

    return {
      topic,
      timestamp: (data.timestamp as number) ?? Date.now(),
      triggerTime:
        (msg.triggerTime as string) ?? new Date().toISOString(),
      scenarioId,
      scenarioType: (msg.scenarioType as string) ?? 'unknown',
      objectId: (msg.objectId as string) ?? '',
      classTypes: (msg.classTypes as string) ?? '',
      active:
        msg.active === '1' ||
        msg.active === 'true' ||
        (data.active as boolean) === true,
    }
  } catch {
    return null
  }
}

// ---- Topic builder for specific scenarios ----------------------------------

export function mqttAoaTopics(scenarioIds: number[]): string[] {
  return scenarioIds.map(
    (id) => `axis:CameraApplicationPlatform/ObjectAnalytics/Device1Scenario${id}`
  )
}

// ---- Main stream function --------------------------------------------------

export async function streamMqttEvents(
  host: string,
  username: string,
  password: string,
  opts: MqttStreamOptions
): Promise<void> {
  const config = await getMqttConfig(host, username, password)

  const topics =
    opts.topicFilters ?? config.topics
  if (topics.length === 0) {
    topics.push('axis:CameraApplicationPlatform/ObjectAnalytics/#')
  }

  const client = mqtt.connect(config.broker, {
    username,
    password,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
  })

  return new Promise<void>((resolve, _reject) => {
    const cleanup = () => {
      try {
        client.end(true)
      } catch {
        // ignore cleanup errors
      }
      resolve()
    }

    opts.signal?.addEventListener('abort', cleanup)

    client.on('connect', () => {
      for (const topic of topics) {
        client.subscribe(topic, (err) => {
          if (err)
            opts.onError?.(
              new Error(`MQTT subscribe failed for ${topic}: ${err.message}`)
            )
        })
      }
    })

    client.on('message', (topic: string, payload: Buffer) => {
      const event = parseMqttEvent(topic, payload)
      if (event) opts.onEvent(event)
    })

    client.on('error', (err: Error) => {
      opts.onError?.(err)
    })

    client.on('close', () => resolve())

    client.on('offline', () => {
      opts.onError?.(new Error('MQTT broker offline'))
    })
  })
}
