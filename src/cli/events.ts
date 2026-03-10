import { program } from './root.js'
import { streamEvents, aoaTopics } from '../lib/event-stream.js'
import { credentialStore } from '../lib/credential-store.js'

const events = program
  .command('events')
  .description('stream real-time analytics events from cameras')

events
  .command('stream <ip>')
  .description('stream AOA events in real time')
  .option('-s, --scenario <ids>', 'comma-separated scenario IDs (default: all)')
  .option('-c, --count <n>', 'stop after N events', '0')
  .option('--active-only', 'only show trigger-start events (active=true)', false)
  .action(async (ip: string, opts: { scenario?: string; count: string; activeOnly: boolean }) => {
    const cred = credentialStore.get(ip)
    if (!cred) {
      console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
      process.exit(1)
    }

    const fmt = program.opts().format as string
    const maxCount = parseInt(opts.count)
    let received = 0

    const topicFilters = opts.scenario
      ? aoaTopics(opts.scenario.split(',').map((s) => parseInt(s.trim())))
      : undefined // default = all ObjectAnalytics

    const ac = new AbortController()

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      process.stderr.write('\nStopping stream...\n')
      ac.abort()
    })

    if (fmt === 'table') {
      process.stderr.write(`Streaming events from ${ip} (Ctrl+C to stop)...\n\n`)
      process.stderr.write('TIME                       SCENARIO  TYPE          OBJECT  CLASS     ACTIVE\n')
      process.stderr.write('─'.repeat(80) + '\n')
    }

    try {
      await streamEvents(ip, cred.username, cred.password, {
        topicFilters,
        signal: ac.signal,
        onEvent: (event) => {
          if (opts.activeOnly && !event.active) return

          received++

          if (fmt === 'json') {
            console.log(JSON.stringify(event, null, 2))
          } else if (fmt === 'jsonl') {
            console.log(JSON.stringify(event))
          } else if (fmt === 'csv') {
            if (received === 1) {
              console.log('timestamp,triggerTime,scenarioId,scenarioType,objectId,classTypes,active')
            }
            console.log(`${event.timestamp},${event.triggerTime},${event.scenarioId},${event.scenarioType},${event.objectId},${event.classTypes},${event.active}`)
          } else {
            // table: rolling output
            const time = new Date(event.timestamp).toISOString().replace('T', ' ').substring(0, 23)
            const active = event.active ? '▶ yes' : '◼ no '
            console.log(
              `${time}  ${String(event.scenarioId).padEnd(8)}  ${event.scenarioType.padEnd(12)}  ${event.objectId.padEnd(6)}  ${event.classTypes.padEnd(8)}  ${active}`
            )
          }

          if (maxCount > 0 && received >= maxCount) {
            process.stderr.write(`\nReceived ${received} events. Done.\n`)
            ac.abort()
          }
        },
        onError: (err) => {
          console.error('Stream error:', err.message)
        },
      })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
      }
    }

    if (fmt === 'table') {
      process.stderr.write(`\nTotal events: ${received}\n`)
    }
  })
