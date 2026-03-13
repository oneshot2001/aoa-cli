# axctl — CLAUDE.md

## Vault Memory
At session start, read these files in order:
1. ~/Obsidian/SecondBrain/02-Projects/axctl/context.md
2. ~/Obsidian/SecondBrain/02-Projects/axctl/decisions.md
3. ~/Obsidian/SecondBrain/02-Projects/axctl/patterns.md
4. ~/Obsidian/SecondBrain/02-Projects/axctl/bugs.md
5. ~/Obsidian/SecondBrain/02-Projects/axctl/architecture.md
6. Last 3 files (by date) in ~/Obsidian/SecondBrain/02-Projects/axctl/dev-log/
7. All files in ~/Obsidian/SecondBrain/05-Knowledge/patterns/

Vault root: ~/Obsidian/SecondBrain

## Auto-Capture Rules
During this session, track:
1. Every architectural decision (what, alternatives considered, why)
2. Every bug fixed (symptom, root cause, fix, prevention rule)
3. Every reusable pattern discovered (code snippet, when to use, where it applies)
4. Architecture changes (new commands, client changes, data flow changes)

At session end, automatically write:
- Session log to: [vault]/02-Projects/axctl/dev-log/YYYY-MM-DD-session-N.md
- Append new decisions to: [vault]/02-Projects/axctl/decisions.md
- Append new bugs to: [vault]/02-Projects/axctl/bugs.md
- Update if changed: [vault]/02-Projects/axctl/architecture.md

## Session Log Format

```markdown
---
date: YYYY-MM-DD
session: N
project: axctl
tags: [dev-log]
---

# Dev Session — axctl — YYYY-MM-DD #N

## Summary
[1-2 sentence overview of what this session accomplished]

## What Was Built
- [Feature/fix 1]: [brief description]

## Decisions Made
### [Decision Title]
- **Options considered:** [option A], [option B]
- **Chosen:** [option]
- **Reasoning:** [why]
- **Trade-offs:** [what we gave up]

## Bugs Encountered & Fixed
### [Bug Title]
- **Symptom:** [what you saw]
- **Root cause:** [why it happened]
- **Fix:** [what resolved it]
- **Prevention:** [rule to avoid in future]
- **Files changed:** [paths]

## Patterns Discovered
### [Pattern Name]
- **When to use:** [description]
```typescript
[code snippet]
```

## Architecture Changes
- [Change]: [before] -> [after]

## Open Questions
- [ ] [Unresolved question]

## Next Session Should
- [Top priority]
```

## Monorepo Structure

```
axctl/
├── packages/
│   ├── core/           @axctl/core — VAPIX clients, discovery, auth, storage
│   │   ├── src/
│   │   │   ├── lib/        17 client modules (vapix, aoa, ptz, fleet, etc.)
│   │   │   ├── types/      TypeScript type definitions
│   │   │   ├── formatters/ Output formatters (table/json/jsonl/csv/yaml)
│   │   │   ├── alphavision/ AlphaVision platform integration
│   │   │   ├── storage/    SQLite registry + macOS Keychain + migration
│   │   │   ├── index.ts    Barrel export
│   │   │   └── client.ts   High-level AxctlClient
│   │   └── tests/
│   ├── cli/            @axctl/cli — CLI commands importing from @axctl/core
│   │   └── src/
│   │       ├── cli/        16 command files (Commander.js)
│   │       ├── index.ts    CLI entry point
│   │       └── alphavision-entry.ts
│   ├── mcp/            @axctl/mcp — MCP server for Claude Code / Cursor
│   │   └── src/
│   │       └── index.ts    11 tools, stdio transport
│   └── raycast/        @axctl/raycast — Raycast extension (planned)
├── apps/
│   ├── axisbar/        macOS menu bar app (planned, Swift)
│   └── fuse/           Finder volume daemon (planned, Swift)
├── mcp-config.json     Drop-in Claude Code MCP config
└── tests/              Root integration tests
```

### Stack
- Bun + TypeScript (strict) — monorepo with Bun workspaces
- Commander.js (CLI framework)
- Native fetch + custom HTTP Digest Auth
- bun:sqlite (device registry — zero deps)
- macOS Keychain via `security` CLI (credential storage)
- mqtt.js (event streaming)
- bonjour-service + custom SSDP (discovery)
- @modelcontextprotocol/sdk (MCP server)
- cli-table3 + js-yaml (output formatting)

### Storage
| Data | Location |
|------|----------|
| Device registry | `~/.axctl/devices.db` (SQLite) |
| Credentials (macOS) | Keychain `com.axctl.device-credentials` |
| Credentials (fallback) | `~/.axctl/device-credentials-credentials.json` (chmod 600) |
| Fleets | SQLite `fleets` + `fleet_members` tables |
| Profiles | SQLite `profiles` table |
| Config | SQLite `config` table |

Auto-migration from old Conf (JSON) storage on first access.

### Build Commands
```bash
# Dev run
bun run dev

# Build single binary
bun run build

# Test (all workspaces)
bun test

# Type check
bunx tsc --noEmit

# Start MCP server
bun run mcp
```

### Deploy
```bash
bun run build:all        # macOS + Linux, arm64 + x64
bun run release          # Package as tar.gz/zip
bun run release:checksums
```

### Quality Gates
1. Build passes (`bun run build`)
2. Tests pass (`bun test`) — 57 tests across 6 files
3. Types verified (`bunx tsc --noEmit`)
4. Tested against at least one real Axis camera on local network
5. Git: staged, committed, pushed

### Key Axis References
- VAPIX AOA control: `POST /local/objectanalytics/control.cgi`
- VAPIX device info: `GET /axis-cgi/basicdeviceinfo.cgi`
- Analytics MQTT API (AXIS OS 12.2+): `GET /config/rest/analytics-mqtt/v1beta/data_sources`
- mDNS service type: `_axis-video._tcp`
- SSDP multicast: `239.255.255.250:1900`
