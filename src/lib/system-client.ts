import { digestFetch } from './digest-auth.js'

export interface DateTimeInfo {
  dateTime: string
  timeZone: string
  ntpSources: string[]
  dstEnabled: boolean
  utcOffset: string
}

export interface NetworkInfo {
  ipAddress: string
  subnetMask: string
  gateway: string
  hostname: string
  dnsServers: string[]
  macAddress: string
  dhcpEnabled: boolean
}

export class SystemClient {
  private readonly baseUrl: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.baseUrl = `http://${host}`
  }

  private async postJson(path: string, body: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const res = await digestFetch(url, 'POST', this.username, this.password, JSON.stringify(body))
    if (!res.ok) throw new Error(`System API error: ${res.status} ${res.statusText}`)
    const json = await res.json() as { data?: unknown; error?: { code: string; message: string } }
    if (json.error) throw new Error(`System error: ${json.error.message}`)
    return json.data
  }

  private async getParams(group: string): Promise<Record<string, string>> {
    const url = `${this.baseUrl}/axis-cgi/param.cgi?action=list&group=${group}`
    const res = await digestFetch(url, 'GET', this.username, this.password)
    if (!res.ok) throw new Error(`Param API error: ${res.status}`)
    const text = await res.text()
    const props: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) props[line.substring(0, eq).trim()] = line.substring(eq + 1).trim()
    }
    return props
  }

  async getDateTime(): Promise<DateTimeInfo> {
    const data = await this.postJson('/axis-cgi/time.cgi', {
      apiVersion: '1.0', method: 'getDateTimeInfo'
    }) as Partial<DateTimeInfo> | undefined
    return {
      dateTime: data?.dateTime ?? 'unknown',
      timeZone: data?.timeZone ?? 'unknown',
      ntpSources: data?.ntpSources ?? [],
      dstEnabled: data?.dstEnabled ?? false,
      utcOffset: data?.utcOffset ?? 'unknown',
    }
  }

  async getNetworkInfo(): Promise<NetworkInfo> {
    const params = await this.getParams('Network')
    return {
      ipAddress: params['root.Network.eth0.IPAddress'] ?? params['root.Network.IPv4.IPAddress'] ?? this.host,
      subnetMask: params['root.Network.eth0.SubnetMask'] ?? params['root.Network.IPv4.SubnetMask'] ?? 'unknown',
      gateway: params['root.Network.eth0.DefaultRouter'] ?? params['root.Network.IPv4.DefaultRouter'] ?? 'unknown',
      hostname: params['root.Network.HostName'] ?? 'unknown',
      dnsServers: [params['root.Network.DNSServer1'], params['root.Network.DNSServer2']].filter(Boolean) as string[],
      macAddress: params['root.Network.eth0.MACAddress'] ?? 'unknown',
      dhcpEnabled: params['root.Network.eth0.BootProto'] === 'dhcp' || params['root.Network.BootProto'] === 'dhcp',
    }
  }

  async getUsers(): Promise<string[]> {
    try {
      const data = await this.postJson('/axis-cgi/usermanagement.cgi', {
        apiVersion: '1.0', method: 'getUsers'
      }) as { users?: { name: string; role: string }[] }
      return data?.users?.map(u => `${u.name} (${u.role})`) ?? []
    } catch {
      // Fallback: parse from param API
      const userParams = await this.getParams('Properties.System.Users')
      const users = Object.entries(userParams)
        .filter(([k]) => k.includes('Username'))
        .map(([, v]) => v)
      return users.length > 0 ? users : ['(unable to list users)']
    }
  }
}
