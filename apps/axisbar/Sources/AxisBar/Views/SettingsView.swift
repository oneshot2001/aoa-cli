import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @AppStorage("refreshInterval") private var refreshInterval: Int = 30
    @AppStorage("showOfflineDevices") private var showOfflineDevices: Bool = true

    var body: some View {
        Form {
            Section("General") {
                Picker("Refresh interval", selection: $refreshInterval) {
                    Text("15 seconds").tag(15)
                    Text("30 seconds").tag(30)
                    Text("1 minute").tag(60)
                    Text("5 minutes").tag(300)
                }

                Toggle("Show offline devices", isOn: $showOfflineDevices)
            }

            Section("Registry") {
                LabeledContent("Database") {
                    Text("~/.axctl/devices.db")
                        .font(.system(.body, design: .monospaced))
                }
                LabeledContent("Devices") {
                    Text("\(appState.devices.count)")
                }
                LabeledContent("Fleets") {
                    Text("\(appState.fleets.count)")
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 400, height: 250)
    }
}
