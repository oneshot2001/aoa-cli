import { createInterface } from 'readline'
import { program } from './root.js'

export function startInteractive(): void {
  // Prevent Commander from calling process.exit on errors/help/version
  program.exitOverride()

  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: 'axctl> ',
    historySize: 200,
  })

  console.error('axctl interactive mode — type commands without "axctl" prefix')
  console.error('Type "help" for available commands, "exit" or Ctrl+D to quit\n')

  rl.prompt()

  rl.on('line', async (line: string) => {
    const input = line.trim()

    if (!input) {
      rl.prompt()
      return
    }

    if (input === 'exit' || input === 'quit' || input === 'q') {
      rl.close()
      return
    }

    const args = parseArgs(input)

    try {
      await program.parseAsync(['node', 'axctl', ...args])
    } catch (e: unknown) {
      // Commander throws CommanderError on help, version, and errors
      // Don't exit — just continue the REPL
      const err = e as { code?: string; message?: string }
      if (err.code !== 'commander.helpDisplayed' && err.code !== 'commander.version') {
        if (err.message) console.error(err.message)
      }
    }

    rl.prompt()
  })

  rl.on('close', () => {
    console.error('\nBye!')
    process.exit(0)
  })
}

/** Simple arg parser that respects quoted strings */
function parseArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''

  for (const ch of input) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true
      quoteChar = ch
    } else if (ch === ' ') {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) args.push(current)
  return args
}
