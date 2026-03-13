#!/usr/bin/env bun
process.env.AXCTL_MODE = 'alphavision'

import { program } from './cli/root.js'
import './cli/auth.js'
import './cli/devices.js'
import './cli/discover.js'
import './cli/fleet.js'
import './cli/alphavision.js'

program.parse(process.argv)
