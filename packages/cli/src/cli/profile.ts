import { program } from './root.js'
import { profileStore } from '@axctl/core'
import { credentialStore } from '@axctl/core'
import { fleetStore } from '@axctl/core'
import { formatOutput } from '@axctl/core'

const profile = program
  .command('profile')
  .description('manage named site profiles (credentials + fleets + defaults)')

profile
  .command('create <name>')
  .description('create a new profile')
  .option('--import', 'import current global credentials and fleets into the profile')
  .action((name: string, opts: { import?: boolean }) => {
    if (profileStore.has(name)) {
      console.error(`Profile "${name}" already exists`)
      process.exit(1)
    }
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would create profile "${name}"${opts.import ? ' with imported credentials and fleets' : ' (empty)'}`)
      return
    }
    profileStore.create(name)
    if (opts.import) {
      profileStore.importFrom(name)
      const p = profileStore.get(name)!
      const credCount = Object.keys(p.credentials).length
      const fleetCount = Object.keys(p.fleets).length
      console.log(`✓ Profile "${name}" created with ${credCount} credential${credCount === 1 ? '' : 's'} and ${fleetCount} fleet${fleetCount === 1 ? '' : 's'}`)
    } else {
      console.log(`✓ Profile "${name}" created (empty)`)
    }
  })

profile
  .command('list')
  .description('list all profiles')
  .action(() => {
    const fmt = program.opts().format as string
    const profiles = profileStore.list()
    if (profiles.length === 0) {
      console.log('No profiles. Use: axctl profile create <name>')
      return
    }
    const active = profileStore.getActive()
    const rows = profiles.map((p) => ({
      name: p.name,
      active: p.name === active ? '✓' : '',
      credentials: Object.keys(p.credentials).length,
      fleets: Object.keys(p.fleets).length,
    }))
    console.log(formatOutput(rows, fmt))
  })

profile
  .command('show <name>')
  .description('show profile contents')
  .action((name: string) => {
    const fmt = program.opts().format as string
    const p = profileStore.get(name)
    if (!p) {
      console.error(`Profile "${name}" not found`)
      process.exit(1)
    }
    const active = profileStore.getActive()
    const credCount = Object.keys(p.credentials).length
    const fleetNames = Object.keys(p.fleets)

    if (fmt === 'table') {
      console.log(`Profile: ${p.name}${p.name === active ? ' (active)' : ''}`)
      console.log(`Credentials: ${credCount}`)
      console.log(`Fleets: ${fleetNames.length > 0 ? fleetNames.join(', ') : '(none)'}`)
      if (p.defaults.format) console.log(`Default format: ${p.defaults.format}`)
      if (p.defaults.timeout) console.log(`Default timeout: ${p.defaults.timeout}ms`)
    } else {
      console.log(formatOutput({
        name: p.name,
        active: p.name === active,
        credentials: credCount,
        fleets: fleetNames.join(', ') || '(none)',
        defaultFormat: p.defaults.format ?? '',
        defaultTimeout: p.defaults.timeout ?? '',
      }, fmt))
    }
  })

profile
  .command('use <name>')
  .description('activate a profile (copies its credentials and fleets to global stores)')
  .action((name: string) => {
    if (!profileStore.has(name)) {
      console.error(`Profile "${name}" not found`)
      process.exit(1)
    }
    if (program.opts().dryRun) {
      const p = profileStore.get(name)!
      const credCount = Object.keys(p.credentials).length
      const fleetCount = Object.keys(p.fleets).length
      console.log(`[dry-run] Would activate profile "${name}" — ${credCount} credential${credCount === 1 ? '' : 's'}, ${fleetCount} fleet${fleetCount === 1 ? '' : 's'} would be loaded`)
      return
    }
    profileStore.activate(name)
    const p = profileStore.get(name)!
    const credCount = Object.keys(p.credentials).length
    const fleetCount = Object.keys(p.fleets).length
    console.log(`✓ Switched to profile "${name}" — ${credCount} credential${credCount === 1 ? '' : 's'}, ${fleetCount} fleet${fleetCount === 1 ? '' : 's'} loaded`)
  })

profile
  .command('delete <name>')
  .description('remove a profile')
  .action((name: string) => {
    if (program.opts().dryRun) {
      if (!profileStore.has(name)) {
        console.error(`Profile "${name}" not found`)
        process.exit(1)
      }
      console.log(`[dry-run] Would delete profile "${name}"`)
      return
    }
    if (profileStore.remove(name)) {
      console.log(`✓ Profile "${name}" deleted`)
    } else {
      console.error(`Profile "${name}" not found`)
      process.exit(1)
    }
  })

profile
  .command('update <name>')
  .description('update a profile from current global state')
  .option('--import', 're-import current global credentials and fleets')
  .action((name: string, opts: { import?: boolean }) => {
    if (!profileStore.has(name)) {
      console.error(`Profile "${name}" not found`)
      process.exit(1)
    }
    if (!opts.import) {
      console.error('Specify --import to re-import current credentials and fleets')
      process.exit(1)
    }
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would update profile "${name}" with current global credentials and fleets`)
      return
    }
    profileStore.importFrom(name)
    const p = profileStore.get(name)!
    const credCount = Object.keys(p.credentials).length
    const fleetCount = Object.keys(p.fleets).length
    console.log(`✓ Profile "${name}" updated — ${credCount} credential${credCount === 1 ? '' : 's'}, ${fleetCount} fleet${fleetCount === 1 ? '' : 's'} imported`)
  })
