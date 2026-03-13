import * as readline from 'readline'
import { program } from './root.js'
import { formatOutput } from '@axctl/core'
import { avConfigStore } from '@axctl/core/alphavision'
import type { AlphaVisionConfig } from '@axctl/core/alphavision'
import { authenticate, validateConnection } from '@axctl/core/alphavision'
import { startIngestion, startFleetIngestion } from '@axctl/core/alphavision'
import { syncCameras, pullCameras, reconcile } from '@axctl/core/alphavision'
import { credentialStore } from '@axctl/core'

// ---- Helpers -----------------------------------------------------------------

function requireConfig(): AlphaVisionConfig {
  const config = avConfigStore.get()
  if (!config) {
    console.error('AlphaVision not configured. Run: axctl av setup')
    process.exit(1)
  }
  return config
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise<string>((resolve) => {
    rl.question(question, (ans) => {
      rl.close()
      resolve(ans.trim())
    })
  })
}

// ---- Command group -----------------------------------------------------------

const av = program
  .command('av')
  .description('AlphaVision platform integration')

// ---- av setup ----------------------------------------------------------------

av
  .command('setup')
  .description('configure AlphaVision connection (interactive)')
  .action(async () => {
    const existing = avConfigStore.get()

    const apiUrl = await prompt(`AlphaVision API URL${existing?.apiUrl ? ` [${existing.apiUrl}]` : ''}: `)
    const apiKey = await prompt('API Key: ')
    const orgId = await prompt(`Organization ID (optional)${existing?.orgId ? ` [${existing.orgId}]` : ''}: `)
    const ingestEndpoint = await prompt('Custom ingest endpoint (optional): ')
    const syncIntervalStr = await prompt(`Sync interval in seconds [${existing?.syncInterval ?? 300}]: `)

    const config: AlphaVisionConfig = {
      apiUrl: apiUrl || existing?.apiUrl || '',
      apiKey: apiKey || existing?.apiKey || '',
      orgId: orgId || existing?.orgId || undefined,
      ingestEndpoint: ingestEndpoint || existing?.ingestEndpoint || undefined,
      syncInterval: syncIntervalStr ? parseInt(syncIntervalStr) : (existing?.syncInterval ?? 300),
    }

    if (!config.apiUrl || !config.apiKey) {
      console.error('API URL and API Key are required.')
      process.exit(1)
    }

    // Validate the connection
    process.stderr.write('Validating connection...\n')
    const authResult = await authenticate(config)
    if (!authResult.ok) {
      console.error(`Authentication failed: ${authResult.error}`)
      process.exit(1)
    }

    avConfigStore.set(config)
    console.log(`\u2713 AlphaVision configured`)
    if (authResult.orgName) console.log(`  Organization: ${authResult.orgName}`)
    console.log(`  Endpoint: ${config.apiUrl}`)
  })

// ---- av status ---------------------------------------------------------------

av
  .command('status')
  .description('show AlphaVision connection status')
  .action(async () => {
    const fmt = program.opts().format as string

    if (!avConfigStore.isConfigured()) {
      console.log('AlphaVision: not configured')
      console.log('Run: axctl av setup')
      return
    }

    const config = requireConfig()
    const health = await validateConnection(config)
    const auth = await authenticate(config)

    const data = {
      status: health.reachable ? 'connected' : 'unreachable',
      apiUrl: config.apiUrl,
      orgId: config.orgId ?? '(none)',
      ingestEndpoint: avConfigStore.getIngestEndpoint(),
      syncInterval: `${avConfigStore.getSyncInterval()}s`,
      platformVersion: health.version ?? 'unknown',
      authenticated: auth.ok ? 'yes' : `no (${auth.error})`,
    }

    console.log(formatOutput(data, fmt))
  })

// ---- av ingest ---------------------------------------------------------------

av
  .command('ingest [ip]')
  .description('start event ingestion to AlphaVision')
  .option('--fleet <name>', 'ingest from all cameras in a fleet')
  .action(async (ip: string | undefined, opts: { fleet?: string }) => {
    const config = requireConfig()

    if (!ip && !opts.fleet) {
      console.error('Provide a camera IP or --fleet <name>')
      process.exit(1)
    }

    const ac = new AbortController()
    process.on('SIGINT', () => {
      process.stderr.write('\nStopping ingestion...\n')
      ac.abort()
    })

    let eventCount = 0

    if (opts.fleet) {
      process.stderr.write(`Starting fleet ingestion: ${opts.fleet} -> AlphaVision (Ctrl+C to stop)\n`)
      const handles = await startFleetIngestion(opts.fleet, config, {
        onEvent: (e) => {
          eventCount++
          process.stderr.write(`\r  Events ingested: ${eventCount} (latest: ${e.sourceId} ${e.type})`)
        },
        onError: (err) => {
          process.stderr.write(`\n  Error: ${err.message}\n`)
        },
      })

      // Wait for abort
      await new Promise<void>((resolve) => {
        ac.signal.addEventListener('abort', () => {
          for (const h of handles) h.abort()
          resolve()
        })
      })
    } else {
      const cred = credentialStore.get(ip!)
      if (!cred) {
        console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
        process.exit(1)
      }

      process.stderr.write(`Starting ingestion: ${ip} -> AlphaVision (Ctrl+C to stop)\n`)
      const handle = await startIngestion(ip!, cred.username, cred.password, config, {
        onEvent: (e) => {
          eventCount++
          process.stderr.write(`\r  Events ingested: ${eventCount} (latest: ${e.type} ${e.objectClass})`)
        },
        onError: (err) => {
          process.stderr.write(`\n  Error: ${err.message}\n`)
        },
      })

      // Wait for abort
      await new Promise<void>((resolve) => {
        ac.signal.addEventListener('abort', () => {
          handle.abort()
          resolve()
        })
      })
    }

    process.stderr.write(`\nTotal events ingested: ${eventCount}\n`)
  })

// ---- av sync -----------------------------------------------------------------

av
  .command('sync')
  .description('sync cameras between axctl and AlphaVision')
  .option('--push', 'push local cameras to AlphaVision')
  .option('--pull', 'pull AlphaVision cameras into local fleet')
  .option('--fleet <name>', 'target fleet name for pull (default: alphavision)')
  .action(async (opts: { push?: boolean; pull?: boolean; fleet?: string }) => {
    const config = requireConfig()
    const fmt = program.opts().format as string

    // Default: reconcile (show diff)
    if (!opts.push && !opts.pull) {
      process.stderr.write('Comparing local cameras with AlphaVision...\n')
      const result = await reconcile(config)

      const rows = [
        ...result.synced.map((ip) => ({ ip, status: 'synced' })),
        ...result.localOnly.map((ip) => ({ ip, status: 'local only' })),
        ...result.remoteOnly.map((ip) => ({ ip, status: 'remote only' })),
      ]

      if (rows.length === 0) {
        console.log('No cameras found locally or remotely.')
        return
      }

      console.log(formatOutput(rows, fmt))
      console.log(`\nSynced: ${result.synced.length}  Local-only: ${result.localOnly.length}  Remote-only: ${result.remoteOnly.length}`)
      return
    }

    if (opts.push) {
      process.stderr.write('Pushing cameras to AlphaVision...\n')
      const result = await syncCameras(config)

      if (result.pushed.length > 0) {
        const rows = result.pushed.map((c) => ({
          ip: c.ip,
          serial: c.serial,
          model: c.model,
          firmware: c.firmware,
          fleet: c.fleet ?? '',
          capabilities: c.capabilities.join(', '),
        }))
        console.log(formatOutput(rows, fmt))
      }

      if (result.failed.length > 0) {
        process.stderr.write('\nFailed:\n')
        for (const f of result.failed) {
          process.stderr.write(`  ${f.ip}: ${f.error}\n`)
        }
      }

      console.log(`\n\u2713 Pushed ${result.pushed.length} camera(s), ${result.failed.length} failed`)
    }

    if (opts.pull) {
      const targetFleet = opts.fleet ?? 'alphavision'
      process.stderr.write(`Pulling cameras from AlphaVision into fleet "${targetFleet}"...\n`)
      const result = await pullCameras(config, targetFleet)

      console.log(`\u2713 Fleet "${result.fleetName}": ${result.added.length} new camera(s) added`)
      if (result.added.length > 0) {
        for (const ip of result.added) {
          console.log(`  + ${ip}`)
        }
      }
    }
  })

// ---- av teardown -------------------------------------------------------------

av
  .command('teardown')
  .description('remove AlphaVision configuration')
  .action(async () => {
    if (!avConfigStore.isConfigured()) {
      console.log('AlphaVision is not configured.')
      return
    }

    const answer = await prompt('Remove AlphaVision configuration? (y/N): ')
    if (answer.toLowerCase() !== 'y') {
      console.log('Cancelled.')
      return
    }

    avConfigStore.clear()
    console.log('\u2713 AlphaVision configuration removed')
  })
