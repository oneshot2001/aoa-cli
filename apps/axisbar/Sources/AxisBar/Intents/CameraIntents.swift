import AppIntents
import AxctlCore

// MARK: - List Cameras

struct ListCamerasIntent: AppIntent {
    static var title: LocalizedStringResource = "List Cameras"
    static var description: IntentDescription = "Lists all cameras in the axctl registry"

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let registry = RegistryReader()
        guard registry.exists else {
            return .result(value: "No device registry found. Run `axctl discover` first.")
        }
        let devices = try registry.listDevices()
        if devices.isEmpty {
            return .result(value: "No cameras in registry.")
        }
        let lines = devices.map { "\($0.ip) — \($0.model ?? "Unknown") (fw: \($0.firmwareVersion ?? "?"))" }
        return .result(value: lines.joined(separator: "\n"))
    }
}

// MARK: - Ping Camera

struct PingCameraIntent: AppIntent {
    static var title: LocalizedStringResource = "Ping Camera"
    static var description: IntentDescription = "Check if an Axis camera is online"

    @Parameter(title: "Camera IP")
    var ip: String

    func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
        let cred = KeychainReader().getWithFallback(host: ip)
        guard let cred else {
            throw IntentError.noCredentials
        }
        let client = VapixClient(host: ip, username: cred.username, password: cred.password)
        let online = await client.ping()
        return .result(value: online)
    }
}

// MARK: - Camera Info

struct CameraInfoIntent: AppIntent {
    static var title: LocalizedStringResource = "Get Camera Info"
    static var description: IntentDescription = "Get detailed info about an Axis camera"

    @Parameter(title: "Camera IP")
    var ip: String

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let cred = KeychainReader().getWithFallback(host: ip)
        guard let cred else {
            throw IntentError.noCredentials
        }
        let client = VapixClient(host: ip, username: cred.username, password: cred.password)
        let info = try await client.getDeviceInfo()
        let result = """
        Model: \(info.ProdFullName)
        Serial: \(info.SerialNumber)
        Firmware: \(info.Version)
        Architecture: \(info.Architecture ?? "N/A")
        Brand: \(info.Brand ?? "N/A")
        """
        return .result(value: result)
    }
}

// MARK: - Shortcuts Provider

struct AxisBarShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ListCamerasIntent(),
            phrases: [
                "List my cameras in \(.applicationName)",
                "Show cameras in \(.applicationName)"
            ],
            shortTitle: "List Cameras",
            systemImageName: "video"
        )
        AppShortcut(
            intent: PingCameraIntent(),
            phrases: [
                "Ping camera in \(.applicationName)",
                "Check camera in \(.applicationName)"
            ],
            shortTitle: "Ping Camera",
            systemImageName: "antenna.radiowaves.left.and.right"
        )
        AppShortcut(
            intent: CameraInfoIntent(),
            phrases: [
                "Get camera info in \(.applicationName)",
                "Camera details in \(.applicationName)"
            ],
            shortTitle: "Camera Info",
            systemImageName: "info.circle"
        )
    }
}

// MARK: - Errors

enum IntentError: Error, CustomLocalizedStringResourceConvertible {
    case noCredentials

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .noCredentials:
            return "No credentials found. Run `axctl auth add <ip>` first."
        }
    }
}
