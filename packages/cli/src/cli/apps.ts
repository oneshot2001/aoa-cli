import { program } from './root.js'
import { appsClient } from '@axctl/core'
import { credentialStore } from '@axctl/core'
import { formatOutput } from '@axctl/core'

const apps = program
  .command('apps')
  .description('manage ACAP applications on cameras')

// axctl apps list <ip>
apps
  .command('list <ip>')
  .description('list installed ACAP apps')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      const list = await appsClient.list(ip, cred.username, cred.password)
      const rows = list.map((a) => ({
        name: a.name,
        niceName: a.niceName,
        version: a.version,
        status: a.status,
        license: a.license,
      }))
      console.log(formatOutput(rows, fmt))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl apps start <ip> <package>
apps
  .command('start <ip> <package>')
  .description('start an ACAP app (e.g. objectanalytics, vmd)')
  .action(async (ip: string, pkg: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      process.stderr.write(`Starting ${pkg} on ${ip}...\n`)
      await appsClient.start(ip, cred.username, cred.password, pkg)
      // Wait for app to come up
      await new Promise((r) => setTimeout(r, 4000))
      const list = await appsClient.list(ip, cred.username, cred.password)
      const app = list.find((a) => a.name === pkg)
      if (app?.status === 'Running') {
        console.log(`✓ ${pkg} is now Running`)
      } else {
        console.log(`Status: ${app?.status ?? 'unknown'} — may need activation in camera web UI`)
        console.log(`  → http://${ip}/local/${pkg}/`)
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl apps stop <ip> <package>
apps
  .command('stop <ip> <package>')
  .description('stop an ACAP app')
  .action(async (ip: string, pkg: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      await appsClient.stop(ip, cred.username, cred.password, pkg)
      console.log(`✓ ${pkg} stopped`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })
