/**
 * @axctl/core — Programmatic API for Axis camera management.
 *
 * Usage:
 *   import { VapixClient, AoaClient, discoverAll } from '@axctl/core'
 *   import { AxctlClient } from '@axctl/core'
 */

// --- VAPIX Core ---
export { VapixClient } from './lib/vapix-client.js'
export type { DeviceProperties } from './lib/vapix-client.js'

// --- Authentication ---
export { digestFetch, buildDigestHeader } from './lib/digest-auth.js'

// --- Analytics (AOA) ---
export { AoaClient } from './lib/aoa-client.js'
export type {
  AoaDevice,
  AoaFilter,
  AoaTrigger,
  AoaObjectClass,
  AoaScenario as AoaScenarioConfig,
  AoaConfiguration,
  CountData,
  OccupancyData,
} from './lib/aoa-client.js'
export { SCENARIO_TYPES, OBJECT_CLASSES, defaultTrigger, defaultFilters } from './lib/aoa-client.js'
export type { ScenarioType as AoaScenarioType } from './lib/aoa-client.js'

// --- Discovery ---
export { discoverMdns, discoverSsdp, discoverAll } from './lib/discovery.js'

// --- Event Streaming ---
export { streamEvents, aoaTopics } from './lib/event-stream.js'
export type { AoaEvent, StreamOptions } from './lib/event-stream.js'

// --- MQTT Streaming ---
export { streamMqttEvents, mqttAoaTopics } from './lib/mqtt-stream.js'
export type { MqttStreamOptions } from './lib/mqtt-stream.js'

// --- Fleet Operations ---
export { fleetExec } from './lib/fleet-ops.js'
export type { FleetResult } from './lib/fleet-ops.js'

// --- Fleet Store ---
export { fleetStore } from './lib/fleet-store.js'
export type { Fleet } from './lib/fleet-store.js'

// --- Credential Store ---
export { credentialStore } from './lib/credential-store.js'

// --- Profile Store ---
export { profileStore } from './lib/profile-store.js'
export type { Profile } from './lib/profile-store.js'

// --- Apps (ACAP) ---
export { appsClient } from './lib/apps-client.js'
export type { AcapApp } from './lib/apps-client.js'

// --- PTZ ---
export { PtzClient } from './lib/ptz-client.js'
export type { PtzPosition, PtzPreset } from './lib/ptz-client.js'

// --- Recording ---
export { RecordingClient } from './lib/recording-client.js'
export type { Recording } from './lib/recording-client.js'

// --- Firmware ---
export { FirmwareClient } from './lib/firmware-client.js'
export type { FirmwareStatus } from './lib/firmware-client.js'

// --- System ---
export { SystemClient } from './lib/system-client.js'
export type { DateTimeInfo, NetworkInfo } from './lib/system-client.js'

// --- Rules (Action Rules) ---
export { RulesClient } from './lib/rules-client.js'
export type { ActionRule } from './lib/rules-client.js'

// --- Formatters ---
export { formatOutput } from './formatters/index.js'
export type { OutputFormat } from './formatters/index.js'

// --- Device Types ---
export type { AxisDevice, DeviceCredential } from './types/device.js'

// --- Analytics Types ---
export type { ScenarioType, ObjectClass, AoaScenario } from './types/analytics.js'

// --- Event Types ---
export type { AnalyticsEvent } from './types/events.js'

// --- High-Level Client ---
export { AxctlClient } from './client.js'

// --- Storage ---
export { deviceRegistry, fleetRegistry, profileRegistry, configRegistry, getDbPath, closeDb } from './storage/registry.js'
export type { DeviceRow, FleetRow, ProfileData } from './storage/registry.js'
export { getCredentialBackend } from './storage/keychain.js'
export type { CredentialBackend } from './storage/backend.js'
export { ensureMigrated } from './storage/migrate.js'
