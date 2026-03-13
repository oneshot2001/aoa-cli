export { avConfigStore } from './config.js'
export type { AlphaVisionConfig } from './config.js'

export { authenticate, validateConnection, getHeaders } from './auth.js'


export { EventIngestClient, startIngestion, startFleetIngestion } from './ingest.js'
export type { AlphaVisionEvent, IngestionHandle } from './ingest.js'

export { syncCameras, pullCameras, reconcile } from './sync.js'
export type { CameraRegistration, SyncResult, PullResult, ReconcileResult } from './sync.js'
