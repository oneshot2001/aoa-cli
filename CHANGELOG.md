# Changelog

## [0.2.0] - 2026-03-13

### Added
- **Monorepo restructure** — 7 packages: `@axctl/core`, `@axctl/cli`, `@axctl/mcp`, `@axctl/raycast`, `core-swift`, AxisBar, AxisFuse
- **PTZ control** — `axctl ptz goto`, `ptz preset list/goto`, `ptz home`, `ptz stop`
- **Firmware management** — `axctl firmware check`, `firmware upgrade`
- **Video recording** — `axctl recording list`, `recording export`, `recording trigger`
- **Action rules** — `axctl rules list`, `rules create`, `rules enable/disable`
- **System info** — `axctl system info`, `system time`, `system users`
- **Config profiles** — `axctl profile create/use/list` for per-site credential bundles
- **Interactive mode** — `axctl interactive` REPL with readline and history
- **MCP server** — 11 tools for Claude Code / Cursor integration via stdio
- **Raycast extension** — 5 commands: camera info, discover, list, open stream, snapshot
- **AxisBar** — macOS menu bar app (SwiftUI) with device list, fleet summary, Siri Shortcuts
- **AxisFuse** — Synced `~/AxisCameras/` directory with periodic snapshots
- **SQLite device registry** — `~/.axctl/devices.db` replaces JSON config
- **macOS Keychain** — credential storage with JSON fallback for other platforms
- **Windows binary** — `axctl-windows-x64.exe` added to build matrix
- **MQTT event streaming** — native MQTT client for AXIS OS 12.2+ analytics topics
- **AlphaVision entry point** — `axctl-av` binary stub for future platform integration

### Changed
- Migrated from single-package to Bun workspace monorepo
- Storage backend from Conf (JSON) to bun:sqlite with auto-migration
- Test count: 45 -> 57 across 6 files

### Fixed
- CLI import paths updated from pre-monorepo relative paths to `@axctl/core`
- MCP server `digestFetch` call signature (missing HTTP method argument)
- MCP server PTZ move using correct `relativeMove` method
- TypeScript config excludes Raycast and integration tests (separate build toolchains)

## [0.1.0] - 2026-02-28

Initial release.

- Device discovery (mDNS + SSDP)
- AOA configuration (get/set/scenarios)
- ACAP app management
- WebSocket event streaming
- Fleet grouping and parallel operations
- Multi-format output (table/json/jsonl/csv/yaml)
- Cross-platform binary builds (macOS + Linux, arm64 + x64)
- 45 tests across 4 modules
