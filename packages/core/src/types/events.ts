export interface AnalyticsEvent {
  timestamp: string
  deviceIp: string
  scenarioName: string
  eventType: string
  objectClass?: string
  count?: number
  raw?: unknown
}
