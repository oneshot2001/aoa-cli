import { program } from './root.js'
import { PtzClient } from '@axctl/core'
import { credentialStore } from '@axctl/core'
import { formatOutput } from '@axctl/core'

function getClient(ip: string): PtzClient {
  const cred = credentialStore.get(ip)
  if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
  return new PtzClient(ip, cred.username, cred.password)
}

const ptz = program
  .command('ptz')
  .description('PTZ camera control — pan, tilt, zoom, presets')

// ---- READ ------------------------------------------------------------------

ptz
  .command('position <ip>')
  .description('show current pan/tilt/zoom position')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const pos = await client.getPosition()
      console.log(formatOutput({ pan: pos.pan, tilt: pos.tilt, zoom: pos.zoom }, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- MOVE ------------------------------------------------------------------

ptz
  .command('goto <ip>')
  .description('absolute move to pan/tilt/zoom coordinates')
  .option('--pan <degrees>', 'pan angle (degrees)')
  .option('--tilt <degrees>', 'tilt angle (degrees)')
  .option('--zoom <level>', 'zoom level')
  .action(async (ip: string, opts: { pan?: string; tilt?: string; zoom?: string }) => {
    const pan = opts.pan !== undefined ? parseFloat(opts.pan) : undefined
    const tilt = opts.tilt !== undefined ? parseFloat(opts.tilt) : undefined
    const zoom = opts.zoom !== undefined ? parseFloat(opts.zoom) : undefined
    if (pan === undefined && tilt === undefined && zoom === undefined) {
      console.error('Specify at least one of --pan, --tilt, or --zoom')
      process.exit(1)
    }
    if (program.opts().dryRun) {
      const parts: string[] = []
      if (pan !== undefined) parts.push(`pan=${pan}`)
      if (tilt !== undefined) parts.push(`tilt=${tilt}`)
      if (zoom !== undefined) parts.push(`zoom=${zoom}`)
      console.log(`[dry-run] Would move ${ip} to ${parts.join(', ')}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.absoluteMove(pan, tilt, zoom)
      const parts: string[] = []
      if (pan !== undefined) parts.push(`pan=${pan}`)
      if (tilt !== undefined) parts.push(`tilt=${tilt}`)
      if (zoom !== undefined) parts.push(`zoom=${zoom}`)
      console.log(`✓ Moved to ${parts.join(', ')}`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

ptz
  .command('move <ip>')
  .description('relative move by pan/tilt/zoom offsets')
  .option('--pan <degrees>', 'relative pan offset (degrees)')
  .option('--tilt <degrees>', 'relative tilt offset (degrees)')
  .option('--zoom <level>', 'relative zoom offset')
  .action(async (ip: string, opts: { pan?: string; tilt?: string; zoom?: string }) => {
    const rpan = opts.pan !== undefined ? parseFloat(opts.pan) : undefined
    const rtilt = opts.tilt !== undefined ? parseFloat(opts.tilt) : undefined
    const rzoom = opts.zoom !== undefined ? parseFloat(opts.zoom) : undefined
    if (rpan === undefined && rtilt === undefined && rzoom === undefined) {
      console.error('Specify at least one of --pan, --tilt, or --zoom')
      process.exit(1)
    }
    if (program.opts().dryRun) {
      const parts: string[] = []
      if (rpan !== undefined) parts.push(`pan=${rpan}`)
      if (rtilt !== undefined) parts.push(`tilt=${rtilt}`)
      if (rzoom !== undefined) parts.push(`zoom=${rzoom}`)
      console.log(`[dry-run] Would relative-move ${ip} by ${parts.join(', ')}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.relativeMove(rpan, rtilt, rzoom)
      const parts: string[] = []
      if (rpan !== undefined) parts.push(`pan=${rpan}`)
      if (rtilt !== undefined) parts.push(`tilt=${rtilt}`)
      if (rzoom !== undefined) parts.push(`zoom=${rzoom}`)
      console.log(`✓ Relative move by ${parts.join(', ')}`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

ptz
  .command('home <ip>')
  .description('move camera to home position')
  .action(async (ip: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would move ${ip} to home position`)
      return
    }
    const client = getClient(ip)
    try {
      await client.goHome()
      console.log('✓ Moved to home position')
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

ptz
  .command('stop <ip>')
  .description('stop all PTZ movement')
  .action(async (ip: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would stop PTZ movement on ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.stop()
      console.log('✓ PTZ movement stopped')
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

// ---- PRESETS ---------------------------------------------------------------

const preset = ptz
  .command('preset')
  .description('manage PTZ presets')

preset
  .command('list <ip>')
  .description('list configured presets')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const presets = await client.listPresets()
      if (presets.length === 0) {
        console.log('No presets configured.')
        return
      }
      const rows = presets.map((p) => ({ position: p.position, name: p.name }))
      console.log(formatOutput(rows, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

preset
  .command('goto <ip> <name>')
  .description('move camera to a named preset')
  .action(async (ip: string, name: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would move ${ip} to preset "${name}"`)
      return
    }
    const client = getClient(ip)
    try {
      await client.gotoPreset(name)
      console.log(`✓ Moved to preset "${name}"`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })
