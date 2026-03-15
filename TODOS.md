# axctl — Deferred Work

## P2: Instrument fleet operations with telemetry hooks
- **What:** Add per-device telemetry.recordHealthCheck() and telemetry.recordConfigSnapshot() to fleet ping, fleet health, fleet status, fleet aoa subcommands
- **Why:** Fleet ops are the primary V2 Bayesian use case (cross-camera correlation, fleet-wide anomaly detection). Currently they produce zero telemetry despite being the highest-value data source.
- **Effort:** S (~30 lines across fleet.ts)
- **Depends on:** Telemetry V1 hooks (done)

## P3: Refactor AoaClient to use VapixClient for HTTP
- **What:** Make AoaClient delegate HTTP requests to VapixClient instead of using its own raw fetch() + manual digest auth at aoa-client.ts:123-148
- **Why:** Eliminates duplicate digest auth implementation. Gets VAPIX telemetry for free without separate AoaClient instrumentation. Reduces maintenance burden of two auth paths.
- **Effort:** M (~2 hours, touches auth flow and all AOA tests)
- **Depends on:** Nothing — standalone refactor

## P3: Add `axctl telemetry export` and `axctl telemetry reset` commands
- **What:** `export --csv/--json` dumps telemetry data for external analysis (Jupyter, Grafana). `reset` deletes the DB for a clean slate.
- **Why:** Enables external tooling for V2 development workflow. Reset useful for testing and CI.
- **Effort:** S (~30 min for both)
- **Depends on:** Telemetry stats command (done)

## P3: Track enabled/disabled status per scenario in config snapshots
- **What:** Add enabled_count or per-scenario enabled flag to ConfigSnapshotEntry so V2 can track not just "what scenarios exist" but "which are active"
- **Why:** V2 drift detection would benefit from knowing if a scenario was disabled vs removed. Currently only scenario names and count are captured.
- **Effort:** S (~15 min once AOA enabled state encoding is understood)
- **Depends on:** Understanding how AOA scenarios encode enabled/disabled state
