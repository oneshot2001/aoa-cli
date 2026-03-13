import SwiftUI
import AxctlCore

@main
struct AxisBarApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        MenuBarExtra("AxisBar", systemImage: "video.fill") {
            MenuBarView()
                .environmentObject(appState)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .environmentObject(appState)
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published var devices: [RegistryReader.Device] = []
    @Published var fleets: [RegistryReader.Fleet] = []
    @Published var isLoading = false
    @Published var lastError: String?

    private let registry = RegistryReader()

    func refresh() {
        guard registry.exists else {
            lastError = "No device registry. Run `axctl discover` first."
            return
        }

        isLoading = true
        lastError = nil

        do {
            devices = try registry.listDevices()
            fleets = try registry.listFleets()
        } catch {
            lastError = error.localizedDescription
        }

        isLoading = false
    }

    func pingDevice(_ ip: String) async -> Bool {
        let cred = KeychainReader().getWithFallback(host: ip)
        guard let cred else { return false }
        let client = VapixClient(host: ip, username: cred.username, password: cred.password)
        return await client.ping()
    }
}
