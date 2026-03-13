#!/usr/bin/env bun
import { program } from './cli/root.js'
import './cli/auth.js'
import './cli/devices.js'
import './cli/discover.js'
import './cli/fleet.js'
import './cli/analytics.js'
import './cli/apps.js'
import './cli/events.js'
import './cli/firmware.js'
import './cli/ptz.js'
import './cli/profile.js'
import './cli/recording.js'
import './cli/system.js'
import './cli/rules.js'
import './cli/alphavision.js'
import { startInteractive } from './cli/interactive.js'

// Register interactive as a named command too
program
  .command('interactive')
  .alias('i')
  .description('start interactive REPL mode')
  .action(() => startInteractive())

// If no args (just "axctl" with no commands or flags), start interactive
const userArgs = process.argv.slice(2)
if (userArgs.length === 0) {
  startInteractive()
} else {
  program.parse(process.argv)
}
