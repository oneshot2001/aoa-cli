import SwiftUI
import AxctlCore

struct MenuBarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("AxisBar")
                    .font(.headline)
                Spacer()
                Button(action: { appState.refresh() }) {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            if let error = appState.lastError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.secondary)
                    .padding(12)
            } else if appState.devices.isEmpty {
                Text("No cameras found")
                    .foregroundStyle(.secondary)
                    .padding(12)
            } else {
                // Device list
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(appState.devices, id: \.ip) { device in
                            DeviceRow(device: device)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .frame(maxHeight: 300)

                // Fleet summary
                if !appState.fleets.isEmpty {
                    Divider()
                    ForEach(appState.fleets, id: \.name) { fleet in
                        HStack {
                            Image(systemName: "rectangle.3.group")
                            Text(fleet.name)
                                .font(.caption)
                            Spacer()
                            Text("\(fleet.members.count)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                    }
                }
            }

            Divider()

            // Footer
            HStack {
                Text("\(appState.devices.count) cameras")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Settings...") {
                    NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
                }
                .buttonStyle(.borderless)
                .font(.caption)

                Button("Quit") {
                    NSApplication.shared.terminate(nil)
                }
                .buttonStyle(.borderless)
                .font(.caption)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .frame(width: 320)
        .onAppear { appState.refresh() }
    }
}

struct DeviceRow: View {
    let device: RegistryReader.Device
    @State private var isOnline: Bool?

    var body: some View {
        HStack {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 1) {
                Text(device.ip)
                    .font(.system(.body, design: .monospaced))
                Text(device.model ?? "Unknown")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if let fw = device.firmwareVersion {
                Text(fw)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private var statusColor: Color {
        switch isOnline {
        case .some(true): return .green
        case .some(false): return .red
        case .none: return .gray
        }
    }
}
