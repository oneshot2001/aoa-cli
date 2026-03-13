import { VapixClient } from './lib/vapix-client.js'
import type { DeviceProperties } from './lib/vapix-client.js'
import { AoaClient } from './lib/aoa-client.js'
import { PtzClient } from './lib/ptz-client.js'
import { RecordingClient } from './lib/recording-client.js'
import { FirmwareClient } from './lib/firmware-client.js'
import { SystemClient } from './lib/system-client.js'
import { RulesClient } from './lib/rules-client.js'
import { appsClient } from './lib/apps-client.js'
import type { AcapApp } from './lib/apps-client.js'

/**
 * High-level convenience client that wraps all Axis VAPIX domain clients
 * into a single object. Useful for programmatic access to a single camera.
 *
 * @example
 * ```ts
 * const cam = new AxctlClient('192.168.1.100', 'root', 'pass')
 * const info = await cam.getDeviceInfo()
 * const scenarios = await cam.aoa.getScenarios()
 * await cam.ptz.goHome()
 * ```
 */
export class AxctlClient {
  /** Core VAPIX client for raw get/post requests */
  readonly vapix: VapixClient
  /** AXIS Object Analytics client */
  readonly aoa: AoaClient
  /** Pan-Tilt-Zoom control client */
  readonly ptz: PtzClient
  /** Edge recording management client */
  readonly recording: RecordingClient
  /** Firmware status and upgrade client */
  readonly firmware: FirmwareClient
  /** System configuration client (time, network, users) */
  readonly system: SystemClient
  /** Action rules engine client */
  readonly rules: RulesClient

  constructor(
    readonly host: string,
    private readonly username: string,
    private readonly password: string,
  ) {
    this.vapix = new VapixClient(host, username, password)
    this.aoa = new AoaClient(host, username, password)
    this.ptz = new PtzClient(host, username, password)
    this.recording = new RecordingClient(host, username, password)
    this.firmware = new FirmwareClient(host, username, password)
    this.system = new SystemClient(host, username, password)
    this.rules = new RulesClient(host, username, password)
  }

  // --- Convenience methods (delegate to domain clients) ---

  /** Check if the camera is reachable */
  async ping(): Promise<boolean> {
    return this.vapix.ping()
  }

  /** Get basic device properties (model, serial, firmware, etc.) */
  async getDeviceInfo(): Promise<DeviceProperties> {
    return this.vapix.getDeviceInfo()
  }

  /** Get firmware version string */
  async getFirmwareVersion(): Promise<string> {
    return this.vapix.getFirmwareVersion()
  }

  /** List installed ACAP applications */
  async listApps(): Promise<AcapApp[]> {
    return appsClient.list(this.host, this.username, this.password)
  }

  /** Start an ACAP application by package name */
  async startApp(packageName: string): Promise<void> {
    return appsClient.start(this.host, this.username, this.password, packageName)
  }

  /** Stop an ACAP application by package name */
  async stopApp(packageName: string): Promise<void> {
    return appsClient.stop(this.host, this.username, this.password, packageName)
  }
}
