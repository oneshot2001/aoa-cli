import { digestFetch } from './digest-auth.js'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

export interface Recording {
  recordingId: string
  startTime: string
  stopTime: string
  source: number
  diskId: string
}

export class RecordingClient {
  private readonly baseUrl: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.baseUrl = `http://${host}`
  }

  private async call(path: string, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const body = JSON.stringify({ apiVersion: '1.0', method, ...(params ? { params } : {}) })
    const url = `${this.baseUrl}${path}`
    const res = await digestFetch(url, 'POST', this.username, this.password, body)
    if (!res.ok) throw new Error(`Recording API error: ${res.status} ${res.statusText}`)
    const json = await res.json() as { data?: unknown; error?: { code: string; message: string } }
    if (json.error) throw new Error(`Recording error ${json.error.code}: ${json.error.message}`)
    return json.data
  }

  async list(): Promise<Recording[]> {
    const data = await this.call('/axis-cgi/record/list.cgi', 'list') as { recordings?: Recording[] }
    return data?.recordings ?? []
  }

  async start(source = 1, durationSeconds?: number): Promise<string> {
    const params: Record<string, unknown> = { source }
    if (durationSeconds) params.options = { nbrseconds: durationSeconds }
    const data = await this.call('/axis-cgi/record/record.cgi', 'start', params) as { recordingId?: string }
    return data?.recordingId ?? 'unknown'
  }

  async stop(recordingId: string): Promise<void> {
    await this.call('/axis-cgi/record/record.cgi', 'stop', { recordingId })
  }

  async export(recordingId: string, outputPath: string): Promise<void> {
    const url = `${this.baseUrl}/axis-cgi/record/export/exportrecording.cgi?schemaversion=1&recordingid=${encodeURIComponent(recordingId)}`
    const res = await digestFetch(url, 'GET', this.username, this.password)
    if (!res.ok) throw new Error(`Export error: ${res.status} ${res.statusText}`)
    if (!res.body) throw new Error('No response body')
    const readable = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
    const writable = createWriteStream(outputPath)
    await pipeline(readable, writable)
  }
}
