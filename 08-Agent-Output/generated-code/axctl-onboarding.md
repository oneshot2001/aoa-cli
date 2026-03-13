# axctl — Installation & Onboarding

> Complete setup guide for the axctl macOS-native suite: CLI, MCP server, Raycast extension, AxisBar menu bar app, and AxisFuse Finder volume.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Bun** | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| **Xcode** | 15+ | Mac App Store (required for Swift packages + tests) |
| **Node.js** | 18+ | `brew install node` (Raycast extension only) |
| **Raycast** | Latest | [raycast.com](https://raycast.com) (optional) |

---

## 1. Clone & Install

```bash
git clone https://github.com/oneshot2001/axctl.git
cd axctl
bun install
```

This installs all workspace dependencies across `packages/core`, `packages/cli`, `packages/mcp`, and `packages/raycast`.

---

## 2. Build the CLI

### Development mode (runs from source)

```bash
bun run dev -- --help
```

### Compile to standalone binary

```bash
bun run build          # → ./axctl (native binary, no runtime needed)
```

To install system-wide:

```bash
cp axctl /usr/local/bin/axctl
```

Verify:

```bash
axctl --version
axctl --help
```

---

## 3. Discover Cameras

axctl needs to know about your cameras. Discovery scans the local network via mDNS and SSDP:

```bash
axctl discover
```

This populates the device registry at `~/.axctl/devices.db` (SQLite). All other tools read from this shared database.

### Add credentials

Most VAPIX operations require authentication:

```bash
axctl auth add 192.168.1.10          # interactive prompt
axctl auth add 192.168.1.10 -u root  # specify username, prompt for password
```

Credentials are stored in the **macOS Keychain** (`com.axctl.device-credentials`). On non-macOS systems, they fall back to `~/.axctl/credentials-<ip>.json` (chmod 600).

### Verify connectivity

```bash
axctl devices list         # show all known cameras
axctl devices info 192.168.1.10   # detailed device info via VAPIX
```

---

## 4. Organize with Fleets & Profiles

### Fleets — named groups of cameras

```bash
axctl fleet create lobby --description "Lobby cameras"
axctl fleet add lobby 192.168.1.10 192.168.1.11
axctl fleet list
```

Fleet commands run operations in parallel across all members:

```bash
axctl firmware status --fleet lobby
axctl aoa list --fleet lobby
```

### Profiles — saved site configurations

```bash
axctl profile create site-a
axctl profile use site-a
axctl profile list
```

---

## 5. Set Up the MCP Server (Claude Code / Cursor)

The MCP server exposes 11 tools to AI coding assistants:

### For Claude Code

Add to your project's `.claude/settings.json` or copy the provided config:

```json
{
  "mcpServers": {
    "axis": {
      "command": "bun",
      "args": ["run", "packages/mcp/src/index.ts"],
      "cwd": "/path/to/axctl"
    }
  }
}
```

### For Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "axis": {
      "command": "bun",
      "args": ["run", "/path/to/axctl/packages/mcp/src/index.ts"]
    }
  }
}
```

### Available MCP tools

| Tool | Description |
|------|-------------|
| `axis_discover_devices` | Scan network for cameras |
| `axis_list_devices` | List registered cameras |
| `axis_device_info` | Get device details (model, serial, firmware) |
| `axis_capture_snapshot` | Capture JPEG from a camera |
| `axis_list_scenarios` | List AOA analytics scenarios |
| `axis_create_scenario` | Create new AOA scenario |
| `axis_fleet_status` | Parallel status across a fleet |
| `axis_firmware_status` | Check firmware versions |
| `axis_list_apps` | List installed ACAP apps |
| `axis_ptz_control` | Pan/tilt/zoom control |
| `axis_check_health` | Ping a camera |

---

## 6. Install the Raycast Extension

```bash
cd packages/raycast
npm install
npm run dev
```

This opens the extension in Raycast's dev mode. Five commands are available:

| Command | What it does |
|---------|-------------|
| **List Cameras** | Browse all registered cameras |
| **Discover** | Run network discovery from Raycast |
| **Snapshot** | Capture and preview a JPEG snapshot |
| **Camera Info** | Detailed device info panel |
| **Open Stream** | Open live RTSP stream in default player |

The Raycast extension reads the same `~/.axctl/devices.db` that the CLI writes to. No separate configuration needed.

---

## 7. Build the Swift Apps

### AxisBar — Menu bar app

```bash
cd apps/axisbar
swift build
```

Run it:

```bash
.build/debug/AxisBar
```

AxisBar shows a menu bar icon with:
- Live device list from the shared registry
- Fleet summary
- Settings panel (refresh interval, offline device visibility)
- **Siri Shortcuts**: "List my cameras", "Ping camera", "Get camera info"

### AxisFuse — Synced Finder volume

```bash
cd apps/fuse
swift build
```

Run it:

```bash
.build/debug/AxisFuse              # default: ~/AxisCameras/
.build/debug/AxisFuse /path/to/dir  # custom location
```

AxisFuse creates a directory tree mirroring your camera registry:

```
~/AxisCameras/
  192.168.1.10/
    snapshot.jpg     ← refreshed every 60s
    info.json        ← device metadata
  192.168.1.11/
    snapshot.jpg
    info.json
```

Cameras that are offline get a `.offline` marker file instead of a snapshot.

### Run Swift tests

```bash
cd packages/core-swift
swift test
```

13 tests covering VapixClient (Digest Auth, DeviceInfo codable) and RegistryReader (device/fleet/profile/config CRUD, DB existence checks).

---

## 8. Verify Everything Works

Run the full verification suite from the repo root:

```bash
# TypeScript tests (57 tests across 6 files)
bun test

# Swift tests (13 tests)
cd packages/core-swift && swift test && cd ../..

# Type check
bunx tsc --noEmit

# CLI binary compiles
bun run build
./axctl --help

# Swift apps compile
cd apps/axisbar && swift build && cd ../..
cd apps/fuse && swift build && cd ../..
```

---

## Quick Reference

| Component | Location | Run |
|-----------|----------|-----|
| CLI (dev) | `packages/cli/` | `bun run dev -- <command>` |
| CLI (binary) | `./axctl` | `bun run build` then `./axctl` |
| MCP server | `packages/mcp/` | `bun run mcp` |
| Raycast | `packages/raycast/` | `cd packages/raycast && npm run dev` |
| AxisBar | `apps/axisbar/` | `swift build && .build/debug/AxisBar` |
| AxisFuse | `apps/fuse/` | `swift build && .build/debug/AxisFuse` |
| Core (TS) | `packages/core/` | imported by CLI, MCP |
| Core (Swift) | `packages/core-swift/` | imported by AxisBar, AxisFuse |

### Shared state

All components read/write the same data:

| Data | Location | Used by |
|------|----------|---------|
| Device registry | `~/.axctl/devices.db` | CLI, MCP, Raycast, AxisBar, AxisFuse |
| Credentials | macOS Keychain | CLI, MCP, AxisBar, AxisFuse |
| Credentials (fallback) | `~/.axctl/credentials-*.json` | Raycast, non-macOS |

### Migration from older axctl

If you previously used axctl with JSON config (`~/.config/axctl/config.json` or `~/Library/Preferences/axctl/config.json`), migration happens automatically on first run. Your old config file is renamed to `.migrated`, not deleted.
