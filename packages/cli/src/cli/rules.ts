import { program } from './root.js'
import { RulesClient } from '@axctl/core'
import { credentialStore } from '@axctl/core'
import { formatOutput } from '@axctl/core'

function getClient(ip: string): RulesClient {
  const cred = credentialStore.get(ip)
  if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
  return new RulesClient(ip, cred.username, cred.password)
}

const rules = program
  .command('rules')
  .description('manage action rules — triggers, recipients, and automation')

// ---- READ ------------------------------------------------------------------

rules
  .command('list <ip>')
  .description('list all action rules')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const actionRules = await client.list()
      if (actionRules.length === 0) {
        console.log('No action rules configured.')
        return
      }
      const rows = actionRules.map((rule) => ({
        id: rule.ruleID,
        name: rule.name,
        enabled: rule.enabled ? 'yes' : 'no',
        trigger: rule.primary,
        action: rule.action,
      }))
      console.log(formatOutput(rows, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

rules
  .command('templates <ip>')
  .description('show available action and recipient templates')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const [actions, recipients] = await Promise.all([
        client.getTemplates(),
        client.getRecipientTemplates(),
      ])
      console.log('--- Action Templates ---')
      console.log(formatOutput(actions, fmt))
      console.log('\n--- Recipient Templates ---')
      console.log(formatOutput(recipients, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- WRITE -----------------------------------------------------------------

rules
  .command('enable <ip> <ruleId>')
  .description('enable an action rule')
  .action(async (ip: string, ruleIdStr: string) => {
    const ruleId = parseInt(ruleIdStr)
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would enable rule ${ruleId} on ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.enable(ruleId)
      console.log(`✓ Rule ${ruleId} enabled on ${ip}`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

rules
  .command('disable <ip> <ruleId>')
  .description('disable an action rule')
  .action(async (ip: string, ruleIdStr: string) => {
    const ruleId = parseInt(ruleIdStr)
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would disable rule ${ruleId} on ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.disable(ruleId)
      console.log(`✓ Rule ${ruleId} disabled on ${ip}`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

rules
  .command('remove <ip> <ruleId>')
  .description('remove an action rule')
  .action(async (ip: string, ruleIdStr: string) => {
    const ruleId = parseInt(ruleIdStr)
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would remove rule ${ruleId} from ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.remove(ruleId)
      console.log(`✓ Rule ${ruleId} removed from ${ip}`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })
