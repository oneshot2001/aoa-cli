export interface AxisDevice {
  ip: string
  model: string
  serial: string
  firmwareVersion: string
  macAddress?: string
  analyticsCapabilities?: string[]
}

export interface DeviceCredential {
  ip: string
  username: string
  password: string
}
