import { buildDigestHeader } from './digest-auth.js'

// ---- Types -----------------------------------------------------------------

export interface ActionRule {
  ruleID: number
  name: string
  enabled: boolean
  primary: string
  secondary?: string
  condition?: string
  action: string
}

// ---- Client ----------------------------------------------------------------

export class RulesClient {
  private readonly url: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.url = `http://${host}/axis-cgi/actionrule.cgi`
  }

  private async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const body = JSON.stringify({ apiVersion: '1.0', method, ...(params ? { params } : {}) })

    const probe = await fetch(this.url, {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' }
    })

    let res: Response
    if (probe.status === 401) {
      const wwwAuth = probe.headers.get('www-authenticate') ?? ''
      const fields: Record<string, string> = {}
      const re = /(\w+)="([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(wwwAuth)) !== null) fields[m[1]!] = m[2]!
      const challenge = { realm: fields.realm ?? '', nonce: fields.nonce ?? '', algorithm: 'MD5', qop: fields.qop, opaque: fields.opaque }
      const authHeader = buildDigestHeader('POST', '/axis-cgi/actionrule.cgi', this.username, this.password, challenge)
      res = await fetch(this.url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Authorization: authHeader } })
    } else {
      res = probe
    }

    if (!res.ok) throw new Error(`Rules API error: ${res.status}`)
    const json = await res.json() as { data?: unknown; error?: { code: string; message: string } }
    if (json.error) throw new Error(`Rules error ${json.error.code}: ${json.error.message}`)
    return json.data
  }

  // ---- Read ----------------------------------------------------------------

  async list(): Promise<ActionRule[]> {
    const data = await this.call('getActionRules') as { actionRules?: ActionRule[] }
    return data?.actionRules ?? []
  }

  async getTemplates(): Promise<Record<string, unknown>[]> {
    const data = await this.call('getActionTemplates') as { actionTemplates?: Record<string, unknown>[] }
    return data?.actionTemplates ?? []
  }

  async getRecipientTemplates(): Promise<Record<string, unknown>[]> {
    const data = await this.call('getRecipientTemplates') as { recipientTemplates?: Record<string, unknown>[] }
    return data?.recipientTemplates ?? []
  }

  // ---- Write ---------------------------------------------------------------

  async enable(ruleId: number): Promise<void> {
    await this.call('setActionRule', { ruleID: ruleId, enabled: true })
  }

  async disable(ruleId: number): Promise<void> {
    await this.call('setActionRule', { ruleID: ruleId, enabled: false })
  }

  async remove(ruleId: number): Promise<void> {
    await this.call('removeActionRule', { ruleID: ruleId })
  }
}
