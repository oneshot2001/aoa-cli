import { Command } from 'commander'

function generateBashCompletions(name: string): string {
  const commands = [
    'auth', 'devices', 'discover', 'fleet', 'aoa', 'apps', 'events', 'profile',
    'recording', 'ptz', 'firmware', 'system', 'rules', 'config', 'telemetry', 'interactive', 'completions', 'help'
  ]
  const authSubs = ['add', 'list', 'remove']
  const devicesSubs = ['info', 'ping', 'list']
  const fleetSubs = ['create', 'list', 'show', 'delete', 'ping', 'status', 'health', 'aoa', 'events']
  const aoaSubs = ['list', 'devices', 'capabilities', 'create', 'remove', 'rename', 'alarm', 'counts', 'occupancy', 'reset', 'export', 'import']
  const appsSubs = ['list', 'start', 'stop']
  const eventsSubs = ['stream', 'mqtt']
  const profileSubs = ['create', 'list', 'show', 'use', 'delete', 'update']
  const recordingSubs = ['list', 'start', 'stop', 'export']
  const ptzSubs = ['goto', 'move', 'home', 'stop', 'position', 'preset']
  const firmwareSubs = ['check', 'upgrade']
  const systemSubs = ['info', 'time', 'network', 'users']
  const rulesSubs = ['list', 'enable', 'disable', 'remove', 'templates']
  const configSubs = ['get', 'set', 'unset', 'list', 'keys']
  const telemetrySubs = ['stats']
  const globalOpts = ['-f', '--format', '-v', '--verbose', '--debug', '--dry-run', '--no-telemetry', '-h', '--help', '-V', '--version']
  const formats = ['table', 'json', 'jsonl', 'csv', 'yaml']

  return `# bash completion for ${name}
_${name}() {
  local cur prev words cword
  _init_completion || return

  local commands="${commands.join(' ')}"
  local global_opts="${globalOpts.join(' ')}"

  case "\${words[1]}" in
    auth) COMPREPLY=($(compgen -W "${authSubs.join(' ')}" -- "$cur")) ;;
    devices) COMPREPLY=($(compgen -W "${devicesSubs.join(' ')}" -- "$cur")) ;;
    fleet) COMPREPLY=($(compgen -W "${fleetSubs.join(' ')}" -- "$cur")) ;;
    aoa) COMPREPLY=($(compgen -W "${aoaSubs.join(' ')}" -- "$cur")) ;;
    apps) COMPREPLY=($(compgen -W "${appsSubs.join(' ')}" -- "$cur")) ;;
    events) COMPREPLY=($(compgen -W "${eventsSubs.join(' ')}" -- "$cur")) ;;
    profile) COMPREPLY=($(compgen -W "${profileSubs.join(' ')}" -- "$cur")) ;;
    recording) COMPREPLY=($(compgen -W "${recordingSubs.join(' ')}" -- "$cur")) ;;
    ptz) COMPREPLY=($(compgen -W "${ptzSubs.join(' ')}" -- "$cur")) ;;
    firmware) COMPREPLY=($(compgen -W "${firmwareSubs.join(' ')}" -- "$cur")) ;;
    system) COMPREPLY=($(compgen -W "${systemSubs.join(' ')}" -- "$cur")) ;;
    rules) COMPREPLY=($(compgen -W "${rulesSubs.join(' ')}" -- "$cur")) ;;
    config) COMPREPLY=($(compgen -W "${configSubs.join(' ')}" -- "$cur")) ;;
    telemetry) COMPREPLY=($(compgen -W "${telemetrySubs.join(' ')}" -- "$cur")) ;;
    *)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=($(compgen -W "$global_opts" -- "$cur"))
      else
        COMPREPLY=($(compgen -W "$commands" -- "$cur"))
      fi
      ;;
  esac

  # Format option completion
  if [[ "$prev" == "-f" || "$prev" == "--format" ]]; then
    COMPREPLY=($(compgen -W "${formats.join(' ')}" -- "$cur"))
  fi
}
complete -F _${name} ${name}`
}

function generateZshCompletions(name: string): string {
  return `#compdef ${name}

_${name}() {
  local -a commands
  commands=(
    'auth:credential management'
    'devices:device management'
    'discover:find Axis cameras on the local network'
    'fleet:manage named groups of cameras'
    'aoa:AXIS Object Analytics management'
    'apps:manage ACAP applications'
    'events:stream real-time analytics events'
    'profile:manage named site profiles'
    'recording:video recording control'
    'ptz:pan/tilt/zoom control'
    'firmware:firmware management'
    'system:system and network info'
    'rules:action rule management'
    'config:manage axctl configuration'
    'telemetry:local telemetry management'
    'interactive:start interactive REPL'
    'completions:generate shell completions'
    'help:display help'
  )

  _arguments -C \\
    '-f[output format]:format:(table json jsonl csv yaml)' \\
    '--format[output format]:format:(table json jsonl csv yaml)' \\
    '-v[verbose output]' \\
    '--verbose[verbose output]' \\
    '--debug[debug logging]' \\
    '--dry-run[preview changes]' \\
    '--no-telemetry[disable local telemetry]' \\
    '-V[show version]' \\
    '--version[show version]' \\
    '-h[show help]' \\
    '--help[show help]' \\
    '1:command:->cmds' \\
    '*::arg:->args'

  case $state in
    cmds)
      _describe 'command' commands
      ;;
    args)
      case \${words[1]} in
        auth) _values 'subcommand' 'add[store credentials]' 'list[show all credentials]' 'remove[delete credentials]' ;;
        devices) _values 'subcommand' 'info[device details]' 'ping[check connectivity]' 'list[list all cameras]' ;;
        fleet) _values 'subcommand' 'create[create a fleet]' 'list[list fleets]' 'show[show fleet members]' 'delete[remove a fleet]' 'ping[check fleet reachability]' 'status[fleet device info]' 'health[fleet health check]' 'aoa[fleet AOA operations]' 'events[fleet event streaming]' ;;
        aoa) _values 'subcommand' 'list[list scenarios]' 'devices[list analytics devices]' 'capabilities[show capabilities]' 'create[create scenario]' 'remove[delete scenario]' 'rename[rename scenario]' 'alarm[fire test alarm]' 'counts[crossing counts]' 'occupancy[current occupancy]' 'reset[reset counts]' 'export[export config]' 'import[import config]' ;;
        apps) _values 'subcommand' 'list[list apps]' 'start[start app]' 'stop[stop app]' ;;
        events) _values 'subcommand' 'stream[WebSocket streaming]' 'mqtt[MQTT streaming]' ;;
        profile) _values 'subcommand' 'create[create profile]' 'list[list profiles]' 'show[show profile]' 'use[activate profile]' 'delete[remove profile]' 'update[update profile]' ;;
        recording) _values 'subcommand' 'list[list recordings]' 'start[trigger recording]' 'stop[stop recording]' 'export[download recording]' ;;
        ptz) _values 'subcommand' 'goto[absolute move]' 'move[relative move]' 'home[go to home]' 'stop[stop movement]' 'position[current position]' 'preset[preset management]' ;;
        firmware) _values 'subcommand' 'check[check firmware version]' 'upgrade[upload firmware]' ;;
        system) _values 'subcommand' 'info[device info]' 'time[date/time/NTP]' 'network[network config]' 'users[user list]' ;;
        rules) _values 'subcommand' 'list[list rules]' 'enable[enable rule]' 'disable[disable rule]' 'remove[delete rule]' 'templates[action templates]' ;;
        config) _values 'subcommand' 'get[get value]' 'set[set value]' 'unset[remove value]' 'list[list all values]' 'keys[list known keys]' ;;
        telemetry) _values 'subcommand' 'stats[collection statistics]' ;;
        completions) _values 'shell' 'bash' 'zsh' 'fish' ;;
      esac
      ;;
  esac
}

_${name}`
}

function generateFishCompletions(name: string): string {
  const lines = [
    `# fish completion for ${name}`,
    ``,
    `# Disable file completions by default`,
    `complete -c ${name} -f`,
    ``,
    `# Global options`,
    `complete -c ${name} -s f -l format -xa 'table json jsonl csv yaml' -d 'Output format'`,
    `complete -c ${name} -s v -l verbose -d 'Verbose output'`,
    `complete -c ${name} -l debug -d 'Debug logging'`,
    `complete -c ${name} -l dry-run -d 'Preview changes'`,
    `complete -c ${name} -l no-telemetry -d 'Disable local telemetry'`,
    `complete -c ${name} -s V -l version -d 'Show version'`,
    ``,
    `# Top-level commands`,
    `complete -c ${name} -n '__fish_use_subcommand' -a auth -d 'Credential management'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a devices -d 'Device management'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a discover -d 'Find Axis cameras'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a fleet -d 'Manage camera groups'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a aoa -d 'Object Analytics'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a apps -d 'ACAP applications'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a events -d 'Event streaming'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a profile -d 'Site profiles'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a recording -d 'Video recording'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a ptz -d 'PTZ control'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a firmware -d 'Firmware management'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a system -d 'System info'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a rules -d 'Action rules'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a config -d 'Configuration'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a telemetry -d 'Telemetry management'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a interactive -d 'Interactive REPL'`,
    `complete -c ${name} -n '__fish_use_subcommand' -a completions -d 'Shell completions'`,
    ``,
    `# auth subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from auth' -a add -d 'Store credentials'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from auth' -a list -d 'Show all credentials'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from auth' -a remove -d 'Delete credentials'`,
    ``,
    `# devices subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from devices' -a info -d 'Device details'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from devices' -a ping -d 'Check connectivity'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from devices' -a list -d 'List all cameras'`,
    ``,
    `# fleet subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from fleet' -a create -d 'Create a fleet'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from fleet' -a list -d 'List fleets'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from fleet' -a show -d 'Show fleet members'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from fleet' -a delete -d 'Remove a fleet'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from fleet' -a ping -d 'Check reachability'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from fleet' -a status -d 'Fleet device info'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from fleet' -a health -d 'Health check'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from fleet' -a aoa -d 'AOA operations'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from fleet' -a events -d 'Event streaming'`,
    ``,
    `# aoa subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a list -d 'List scenarios'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a devices -d 'Analytics devices'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a capabilities -d 'Show capabilities'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a create -d 'Create scenario'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a remove -d 'Delete scenario'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a rename -d 'Rename scenario'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a alarm -d 'Fire test alarm'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a counts -d 'Crossing counts'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a occupancy -d 'Current occupancy'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a reset -d 'Reset counts'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a export -d 'Export config'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from aoa' -a import -d 'Import config'`,
    ``,
    `# apps subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from apps' -a list -d 'List apps'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from apps' -a start -d 'Start app'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from apps' -a stop -d 'Stop app'`,
    ``,
    `# events subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from events' -a stream -d 'WebSocket streaming'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from events' -a mqtt -d 'MQTT streaming'`,
    ``,
    `# profile subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from profile' -a create -d 'Create profile'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from profile' -a list -d 'List profiles'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from profile' -a show -d 'Show profile'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from profile' -a use -d 'Activate profile'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from profile' -a delete -d 'Remove profile'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from profile' -a update -d 'Update profile'`,
    ``,
    `# recording subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from recording' -a list -d 'List recordings'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from recording' -a start -d 'Trigger recording'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from recording' -a stop -d 'Stop recording'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from recording' -a export -d 'Download recording'`,
    ``,
    `# ptz subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from ptz' -a goto -d 'Absolute move'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from ptz' -a move -d 'Relative move'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from ptz' -a home -d 'Go to home'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from ptz' -a stop -d 'Stop movement'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from ptz' -a position -d 'Current position'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from ptz' -a preset -d 'Preset management'`,
    ``,
    `# firmware subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from firmware' -a check -d 'Check version'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from firmware' -a upgrade -d 'Upload firmware'`,
    ``,
    `# system subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from system' -a info -d 'Device info'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from system' -a time -d 'Date/time/NTP'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from system' -a network -d 'Network config'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from system' -a users -d 'User list'`,
    ``,
    `# rules subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from rules' -a list -d 'List rules'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from rules' -a enable -d 'Enable rule'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from rules' -a disable -d 'Disable rule'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from rules' -a remove -d 'Delete rule'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from rules' -a templates -d 'Action templates'`,
    ``,
    `# config subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from config' -a get -d 'Get value'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from config' -a set -d 'Set value'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from config' -a unset -d 'Remove value'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from config' -a list -d 'List all values'`,
    `complete -c ${name} -n '__fish_seen_subcommand_from config' -a keys -d 'List known keys'`,
    ``,
    `# telemetry subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from telemetry' -a stats -d 'Collection statistics'`,
    ``,
    `# completions subcommands`,
    `complete -c ${name} -n '__fish_seen_subcommand_from completions' -a 'bash zsh fish' -d 'Shell type'`,
  ]
  return lines.join('\n')
}

export const program = new Command()

program
  .name('axctl')
  .description('Axis camera analytics CLI — configure AOA, stream events, discover devices')
  .version('0.2.0')
  .option('-f, --format <format>', 'output format (table|json|jsonl|csv|yaml)', 'table')
  .option('-v, --verbose', 'verbose output')
  .option('--debug', 'debug logging (show raw requests/responses)')
  .option('--dry-run', 'preview changes without applying them')
  .option('--no-telemetry', 'disable local telemetry collection')

program
  .command('completions <shell>')
  .description('generate shell completions (bash, zsh, fish)')
  .action((shell: string) => {
    const name = 'axctl'

    switch (shell) {
      case 'bash':
        console.log(generateBashCompletions(name))
        break
      case 'zsh':
        console.log(generateZshCompletions(name))
        break
      case 'fish':
        console.log(generateFishCompletions(name))
        break
      default:
        console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`)
        process.exit(1)
    }
  })
