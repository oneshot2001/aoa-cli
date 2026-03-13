# axctl

Command-line interface for Axis cameras — configure AXIS Object Analytics, stream real-time events, manage ACAP apps, and run operations across camera fleets.

```
axctl aoa list 192.168.1.33
axctl events stream 192.168.1.33
axctl fleet ping lab
```

## Install

### Pre-built binary (no runtime required)

| Platform | Command |
|----------|---------|
| macOS Apple Silicon | `curl -L .../axctl-macos-arm64.tar.gz \| tar -xz && sudo mv axctl-macos-arm64 /usr/local/bin/axctl` |
| macOS Intel | `curl -L .../axctl-macos-x64.tar.gz \| tar -xz && sudo mv axctl-macos-x64 /usr/local/bin/axctl` |
| Linux x64 | `curl -L .../axctl-linux-x64.tar.gz \| tar -xz && sudo mv axctl-linux-x64 /usr/local/bin/axctl` |
| Linux ARM64 | `curl -L .../axctl-linux-arm64.tar.gz \| tar -xz && sudo mv axctl-linux-arm64 /usr/local/bin/axctl` |
| Windows x64 | Download `axctl-windows-x64.zip` from [releases](https://github.com/oneshot2001/axctl/releases/latest), extract, add to PATH |

See [INSTALL.md](INSTALL.md) for full instructions and SHA-256 checksums.

### Build from source

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
git clone https://github.com/oneshot2001/axctl.git && cd axctl
bun install
bun run build        # native binary → ./axctl
bun run build:all    # all 5 platforms → dist/
```

---

## Quick start

```bash
# 1. Store camera credentials (saved to ~/.config/axctl/)
axctl auth add 192.168.1.33
#   Username: root
#   Password: ****

# 2. Verify connection
axctl devices ping 192.168.1.33

# 3. List AOA scenarios
axctl aoa list 192.168.1.33

# 4. Stream live events
axctl events stream 192.168.1.33
```

---

## Global options

```
-f, --format <fmt>   Output format: table (default) | json | jsonl | csv | yaml
-v, --verbose        Verbose output
--debug              Show raw HTTP requests and responses
--dry-run            Preview changes without applying them
```

Examples:
```bash
axctl aoa list 192.168.1.33 --format json
axctl fleet status lab --format csv
axctl devices list --format yaml
```

---

## Command reference

### `auth` — Credential management

Credentials are stored locally in `~/.config/axctl/` via the system config store. Passwords are never sent in plaintext — all camera communication uses HTTP Digest Authentication.

```bash
axctl auth add <ip>              # prompt for username + password
axctl auth add <ip> -u root -p pass  # non-interactive
axctl auth list                  # show all stored credentials
axctl auth remove <ip>           # delete credentials for a camera
```

---

### `devices` — Device management

```bash
axctl devices info <ip>    # model, firmware, serial, hardware ID
axctl devices ping <ip>    # connectivity check
axctl devices list         # list all cameras with stored credentials
```

Example output (`devices info`):
```
┌─────────────┬───────────────────────────────┐
│ field       │ value                         │
├─────────────┼───────────────────────────────┤
│ model       │ AXIS Q6358-LE PTZ             │
│ firmware    │ 12.7.61                       │
│ serial      │ ACCC8E012345                  │
│ hardwareId  │ 9F4.1                         │
└─────────────┴───────────────────────────────┘
```

---

### `discover` — Network discovery

Finds Axis cameras on the local network using mDNS and SSDP.

```bash
axctl discover           # 5-second scan (default)
axctl discover -t 10000  # 10-second scan
axctl discover --format json
```

Example output:
```
┌──────────────┬───────────────┬──────────┬───────────────┐
│ ip           │ model         │ firmware │ mac           │
├──────────────┼───────────────┼──────────┼───────────────┤
│ 192.168.1.33 │ AXIS Q6358-LE │ 12.7.61  │ AC:CC:8E:xx   │
└──────────────┴───────────────┴──────────┴───────────────┘
```

---

### `aoa` — AXIS Object Analytics

Manage scenarios on a single camera. Requires AOA to be installed and running (`axctl apps start <ip> objectanalytics`).

#### Read operations

```bash
axctl aoa list <ip>              # list all scenarios
axctl aoa devices <ip>           # list analytics devices (channels)
axctl aoa capabilities <ip>      # supported types, max scenarios, object classes
```

#### Scenario management

```bash
# Create a scenario
axctl aoa create <ip> <name> <type>
axctl aoa create 192.168.1.33 "North Entrance" fence
axctl aoa create 192.168.1.33 "Lobby" occupancyInArea --objects human
axctl aoa create 192.168.1.33 "Gate" crosslinecounting --objects human,vehicle --device 1

# Rename or remove
axctl aoa rename 192.168.1.33 2 "Main Gate"
axctl aoa remove 192.168.1.33 2
```

**Supported scenario types:**

| Type | Trigger | Use case |
|------|---------|----------|
| `motion` | includeArea | General motion in a zone |
| `fence` | fence line | Perimeter crossing |
| `crosslinecounting` | counting line | Bidirectional people/vehicle counting |
| `occupancyInArea` | includeArea | Zone occupancy monitoring |
| `tailgating` | fence line | Closely following persons |
| `fallDetection` | includeArea | Person fall detection |

**Supported object classes:** `human`, `vehicle`, `missing_hardhat`

#### Data retrieval

```bash
axctl aoa counts 192.168.1.33 2      # accumulated crosslinecounting data
axctl aoa occupancy 192.168.1.33 3   # current occupancy count
axctl aoa reset 192.168.1.33 2       # reset accumulated counts
```

#### Testing

```bash
axctl aoa alarm 192.168.1.33 1   # fire a 3-second test alarm (triggers action rules)
```

---

### `events` — Real-time event streaming

Stream AOA detection events over WebSocket. Events fire when objects enter/exit zones, cross lines, or trigger other scenario conditions.

```bash
axctl events stream <ip>
axctl events stream <ip> --scenario 1,3    # only scenarios 1 and 3
axctl events stream <ip> --count 10        # stop after 10 events
axctl events stream <ip> --active-only     # trigger-start events only
```

Example output:
```
time       scenario  type    objectId  class    active
09:14:22   1         motion  obj-42    human    true
09:14:23   1         motion  obj-42    human    false
09:14:31   3         motion  obj-57    vehicle  true
```

Press `Ctrl+C` to stop streaming.

---

### `apps` — ACAP application management

```bash
axctl apps list <ip>                           # list installed apps + status
axctl apps start <ip> objectanalytics          # start AXIS Object Analytics
axctl apps stop <ip> objectanalytics           # stop an app
axctl apps start <ip> vmd                      # start Video Motion Detection
```

Example output (`apps list`):
```
┌──────────────────┬─────────┬─────────┬─────────────────┐
│ name             │ package │ status  │ version         │
├──────────────────┼─────────┼─────────┼─────────────────┤
│ Object Analytics │ objecta │ Running │ 4.5.3-16        │
└──────────────────┴─────────┴─────────┴─────────────────┘
```

---

### `fleet` — Multi-camera operations

Group cameras into named fleets and run operations across all of them in parallel.

#### Fleet management

```bash
axctl fleet create lab --devices 192.168.1.33,192.168.1.34
axctl fleet create site-a --from-discover    # auto-populate from mDNS scan
axctl fleet list
axctl fleet show lab
axctl fleet delete lab
```

#### Parallel operations

All fleet commands use `Promise.allSettled` — a camera going offline or missing credentials returns an error row without blocking the rest.

```bash
axctl fleet ping lab          # reachability + RTT per camera
axctl fleet status lab        # model/firmware/serial across fleet
```

Example (`fleet status`):
```
┌──────────────┬───────────────┬──────────┬──────────────┐
│ ip           │ model         │ firmware │ serial       │
├──────────────┼───────────────┼──────────┼──────────────┤
│ 192.168.1.33 │ AXIS Q6358-LE │ 12.7.61  │ ACCC8E01234  │
│ 192.168.1.34 │ AXIS P3245-V  │ 11.8.4   │ ACCC8E05678  │
└──────────────┴───────────────┴──────────┴──────────────┘
```

#### Fleet AOA operations

```bash
axctl fleet aoa list lab                     # scenarios across all cameras
axctl fleet aoa counts lab 2                 # aggregate crossing counts (scenario ID 2)
axctl fleet aoa create lab "Perimeter" fence # push same scenario to all cameras
```

Example (`fleet aoa list`):
```
┌──────────────┬────┬──────────────────┬────────┬────────────────┬─────────────┐
│ ip           │ id │ name             │ type   │ objects        │ trigger     │
├──────────────┼────┼──────────────────┼────────┼────────────────┼─────────────┤
│ 192.168.1.33 │ 1  │ Default Motion   │ motion │ vehicle, human │ includeArea │
│ 192.168.1.33 │ 3  │ Entrance         │ motion │ human, vehicle │ includeArea │
│ 192.168.1.34 │ 1  │ Perimeter        │ fence  │ human          │ fence       │
└──────────────┴────┴──────────────────┴────────┴────────────────┴─────────────┘
```

---

## Architecture

```
src/
├── index.ts               # entry point
├── cli/                   # Commander.js command groups
│   ├── auth.ts            # credential management
│   ├── devices.ts         # device info + ping
│   ├── discover.ts        # mDNS + SSDP discovery
│   ├── fleet.ts           # fleet CRUD + parallel ops
│   ├── analytics.ts       # AOA scenario management
│   ├── apps.ts            # ACAP app control
│   └── events.ts          # WebSocket event streaming
├── lib/                   # core logic
│   ├── vapix-client.ts    # VAPIX HTTP API wrapper
│   ├── aoa-client.ts      # AOA VAPIX API (getConfiguration/setConfiguration)
│   ├── apps-client.ts     # ACAP app list/start/stop
│   ├── event-stream.ts    # WebSocket event stream + auth
│   ├── fleet-ops.ts       # Promise.allSettled parallel execution engine
│   ├── fleet-store.ts     # persistent fleet storage (Conf)
│   ├── credential-store.ts# persistent credential storage (Conf)
│   ├── digest-auth.ts     # HTTP Digest Authentication implementation
│   └── discovery.ts       # mDNS + SSDP camera discovery
├── formatters/
│   └── index.ts           # table/json/jsonl/csv/yaml output pipeline
└── tests/
    ├── formatters.test.ts  # 14 tests
    ├── digest-auth.test.ts # 6 tests
    ├── aoa-client.test.ts  # 17 tests
    └── fleet-ops.test.ts   # 8 tests
```

**Key design notes:**

- **No network agent / sidecar** — pure CLI, stateless per invocation. Credentials and fleets persist in `~/.config/axctl/` via [Conf](https://github.com/sindresorhus/conf).
- **AOA write model** — Axis Object Analytics uses full-replace configuration (`getConfiguration` → modify → `setConfiguration`). There are no per-resource PATCH endpoints.
- **Digest Auth** — implemented from scratch in `digest-auth.ts`. Supports `qop=auth` and plain Digest (MD5). The ACAP app control endpoint requires form-encoded requests with a separate digest handshake.
- **WebSocket events** — session token obtained via `GET /axis-cgi/wssession.cgi` (15s TTL), used in WebSocket URL. Subscription sent as `events:configure` after connection.

---

## Development

```bash
bun install          # install dependencies
bun run dev          # run from source (no compile step)
bun test             # run test suite (45 tests)
bun run typecheck    # TypeScript strict check
bun run build        # compile native binary → ./axctl
bun run build:all    # all 4 platform binaries → dist/
```

### Tested against

- AXIS Q6358-LE (ARTPEC-9, AXIS OS 12.7.61)
- AXIS Object Analytics 4.5.3-16

---

## Requirements

- Axis camera running AXIS OS 10.x or later
- AXIS Object Analytics installed (for `aoa` and `events` commands)
- Cameras reachable on the local network (HTTP, port 80)
- Credentials with at least Viewer access (Operator recommended for write operations)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and how to submit changes.

## License

[MIT](LICENSE)

---

Created by Matthew at [AlphaVision](https://alphavision.ai)
