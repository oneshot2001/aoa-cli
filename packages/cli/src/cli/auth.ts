import { program } from './root.js'
import { credentialStore } from '@axctl/core'
import Table from 'cli-table3'
import * as readline from 'readline'

const auth = program
  .command('auth')
  .description('credential management')

auth
  .command('add <ip>')
  .description('add credentials for a device')
  .option('-u, --user <username>', 'username', 'root')
  .option('-p, --password <password>', 'password (omit to prompt)')
  .action(async (ip: string, opts: { user: string; password?: string }) => {
    let password = opts.password
    if (!password) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      password = await new Promise<string>((resolve) => {
        rl.question(`Password for ${opts.user}@${ip}: `, (ans) => {
          rl.close()
          resolve(ans)
        })
      })
    }
    credentialStore.add(ip, opts.user, password)
    console.log(`✓ Credentials stored for ${ip}`)
  })

auth
  .command('list')
  .description('show stored credentials')
  .action(() => {
    const creds = credentialStore.list()
    if (creds.length === 0) { console.log('No credentials stored.'); return }
    const table = new Table({ head: ['IP', 'Username'] })
    for (const c of creds) table.push([c.ip, c.username])
    console.log(table.toString())
  })

auth
  .command('remove <ip>')
  .description('remove credentials for a device')
  .action((ip: string) => {
    if (credentialStore.remove(ip)) {
      console.log(`✓ Removed credentials for ${ip}`)
    } else {
      console.error(`No credentials found for ${ip}`)
      process.exit(1)
    }
  })
