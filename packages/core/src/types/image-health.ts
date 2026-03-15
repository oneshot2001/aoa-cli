/**
 * AXIS Image Health Analytics (AIHA) type definitions.
 *
 * AIHA is preinstalled on compatible Axis cameras running AXIS OS 12.0+.
 * It monitors image quality and fires events for: blocked, redirected, blurred, underexposed.
 *
 * API: /axis-cgi/vaconfig.cgi (Application Configuration API)
 * Events: tns1:VideoAnalytics/tnsaxis:ImageHealth/{Blocked,Redirected,Blurred,Underexposed}
 *
 * NOTE: Exact parameter names from vaconfig.cgi must be verified against real hardware.
 * The types below reflect the documented behavior and expected API shape.
 */

export type ImageHealthDetectionType = 'blocked' | 'redirected' | 'blurred' | 'underexposed'

export interface ImageHealthDetectionConfig {
  enabled: boolean
  sensitivity: number          // 0-100, higher = more sensitive
  validationPeriod: number     // seconds, how long condition must persist before firing event
}

export interface ImageHealthConfiguration {
  blocked: ImageHealthDetectionConfig
  redirected: ImageHealthDetectionConfig
  blurred: ImageHealthDetectionConfig
  underexposed: ImageHealthDetectionConfig
}

export interface ImageHealthStatus {
  running: boolean
  version?: string
  sceneSuitable: boolean
  alerts: ImageHealthAlert[]
}

export interface ImageHealthAlert {
  type: ImageHealthDetectionType
  active: boolean
  since?: string              // ISO 8601 timestamp when alert started
}

export interface ImageHealthEvent {
  device_ip: string
  detection: ImageHealthDetectionType
  active: boolean
  timestamp: string           // ISO 8601
  topic: string
}

/** Default fleet baseline configuration */
export const IMAGE_HEALTH_DEFAULTS: ImageHealthConfiguration = {
  blocked: { enabled: true, sensitivity: 50, validationPeriod: 120 },
  redirected: { enabled: true, sensitivity: 50, validationPeriod: 30 },
  blurred: { enabled: true, sensitivity: 60, validationPeriod: 60 },
  underexposed: { enabled: true, sensitivity: 40, validationPeriod: 10 },
}

export const IMAGE_HEALTH_DETECTION_TYPES: ImageHealthDetectionType[] = [
  'blocked', 'redirected', 'blurred', 'underexposed',
]

/** WebSocket event topic filters for AIHA */
export const WS_IMAGE_HEALTH_TOPICS = {
  all: 'tns1:VideoAnalytics/tnsaxis:ImageHealth',
  blocked: 'tns1:VideoAnalytics/tnsaxis:ImageHealth/Blocked',
  redirected: 'tns1:VideoAnalytics/tnsaxis:ImageHealth/Redirected',
  blurred: 'tns1:VideoAnalytics/tnsaxis:ImageHealth/Blurred',
  underexposed: 'tns1:VideoAnalytics/tnsaxis:ImageHealth/Underexposed',
} as const

/** MQTT event topic filters for AIHA */
export const MQTT_IMAGE_HEALTH_TOPICS = {
  all: 'axis:CameraApplicationPlatform/ImageHealth/#',
  blocked: 'axis:CameraApplicationPlatform/ImageHealth/Blocked',
  redirected: 'axis:CameraApplicationPlatform/ImageHealth/Redirected',
  blurred: 'axis:CameraApplicationPlatform/ImageHealth/Blurred',
  underexposed: 'axis:CameraApplicationPlatform/ImageHealth/Underexposed',
} as const
