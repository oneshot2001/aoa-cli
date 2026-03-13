import { program } from './root.js'
import { RecordingClient } from '@axctl/core'
import { credentialStore } from '@axctl/core'
import { formatOutput } from '@axctl/core'

function getClient(ip: string): RecordingClient {
  const cred = credentialStore.get(ip)
  if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
  return new RecordingClient(ip, cred.username, cred.password)
}

const recording = program
  .command('recording')
  .description('video recording control — list, trigger, export')

recording
  .command('list <ip>')
  .description('list recordings on SD/NAS')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const recordings = await client.list()
      if (recordings.length === 0) {
        console.log('No recordings found.')
        return
      }
      const rows = recordings.map((r) => ({
        id: r.recordingId,
        start: r.startTime,
        stop: r.stopTime,
        source: r.source,
        disk: r.diskId,
      }))
      console.log(formatOutput(rows, fmt))
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

recording
  .command('start <ip>')
  .description('trigger a recording')
  .option('--duration <seconds>', 'recording duration in seconds', '30')
  .option('--source <n>', 'video source number', '1')
  .action(async (ip: string, opts: { duration: string; source: string }) => {
    const duration = parseInt(opts.duration)
    const source = parseInt(opts.source)
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would start recording on ${ip} (source: ${source}, duration: ${duration}s)`)
      return
    }
    const client = getClient(ip)
    try {
      const recordingId = await client.start(source, duration)
      console.log(`Recording started (id=${recordingId}, duration=${duration}s, source=${source})`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

recording
  .command('stop <ip> <recordingId>')
  .description('stop an active recording')
  .action(async (ip: string, recordingId: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would stop recording ${recordingId} on ${ip}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.stop(recordingId)
      console.log(`Recording ${recordingId} stopped`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })

recording
  .command('export <ip> <recordingId>')
  .description('download a recording to file')
  .requiredOption('-o, --output <file>', 'output file path')
  .action(async (ip: string, recordingId: string, opts: { output: string }) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would export recording ${recordingId} from ${ip} to ${opts.output}`)
      return
    }
    const client = getClient(ip)
    try {
      await client.export(recordingId, opts.output)
      console.log(`Recording ${recordingId} exported to ${opts.output}`)
    } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1) }
  })
