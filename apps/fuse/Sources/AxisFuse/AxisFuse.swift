import Foundation
import AxctlCore

/// AxisFuse — Synced Finder volume for Axis camera snapshots.
///
/// Creates a directory at ~/AxisCameras/ that mirrors the device registry:
///   ~/AxisCameras/
///     192.168.1.10/
///       snapshot.jpg        (periodically refreshed)
///       info.json           (device info cache)
///     192.168.1.11/
///       snapshot.jpg
///       info.json
///
/// Not a FUSE filesystem — just a synced directory tree that stays in sync
/// with the camera registry and periodically captures snapshots.
@main
struct AxisFuse {
    static let defaultRoot = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("AxisCameras")
    static let registry = RegistryReader()
    static let keychain = KeychainReader()

    static func main() async {
        let args = CommandLine.arguments
        let root: URL
        if args.count > 1 {
            root = URL(fileURLWithPath: args[1])
        } else {
            root = defaultRoot
        }

        print("AxisFuse — Synced camera volume at \(root.path)")

        guard registry.exists else {
            print("Error: No device registry. Run `axctl discover` first.")
            Foundation.exit(1)
        }

        // Initial sync
        await sync(root: root)

        // Periodic sync loop
        let interval: TimeInterval = 60
        print("Syncing every \(Int(interval))s. Press Ctrl+C to stop.")

        signal(SIGINT) { _ in
            print("\nAxisFuse stopped.")
            Foundation.exit(0)
        }

        while true {
            try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            await sync(root: root)
        }
    }

    static func sync(root: URL) async {
        do {
            let devices = try registry.listDevices()
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

            // Create/update per-device directories
            for device in devices {
                let deviceDir = root.appendingPathComponent(device.ip)
                try FileManager.default.createDirectory(at: deviceDir, withIntermediateDirectories: true)

                // Write device info
                let infoPath = deviceDir.appendingPathComponent("info.json")
                let info: [String: String?] = [
                    "ip": device.ip,
                    "mac": device.mac,
                    "model": device.model,
                    "serial": device.serialNumber,
                    "firmware": device.firmwareVersion,
                    "lastSeen": device.lastSeen
                ]
                let compacted = info.compactMapValues { $0 }
                let infoData = try JSONSerialization.data(withJSONObject: compacted, options: [.prettyPrinted, .sortedKeys])
                try infoData.write(to: infoPath)

                // Capture snapshot if credentials available
                guard let cred = keychain.getWithFallback(host: device.ip) else {
                    continue
                }

                let client = VapixClient(host: device.ip, username: cred.username, password: cred.password)
                do {
                    let jpegData = try await client.captureSnapshot()
                    let snapshotPath = deviceDir.appendingPathComponent("snapshot.jpg")
                    try jpegData.write(to: snapshotPath)
                } catch {
                    // Camera might be offline — write error marker
                    let errorPath = deviceDir.appendingPathComponent(".offline")
                    try? "Offline: \(error.localizedDescription)\n".write(to: errorPath, atomically: true, encoding: .utf8)

                    // Remove stale offline marker on success next time
                    continue
                }

                // Remove offline marker if we got a snapshot
                let offlinePath = deviceDir.appendingPathComponent(".offline")
                try? FileManager.default.removeItem(at: offlinePath)
            }

            // Clean up directories for removed devices
            let deviceIPs = Set(devices.map(\.ip))
            if let contents = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
                for item in contents {
                    let name = item.lastPathComponent
                    if !deviceIPs.contains(name) && !name.hasPrefix(".") {
                        try? FileManager.default.removeItem(at: item)
                    }
                }
            }

            print("[\(timestamp())] Synced \(devices.count) cameras")
        } catch {
            print("[\(timestamp())] Sync error: \(error.localizedDescription)")
        }
    }

    static func timestamp() -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f.string(from: Date())
    }
}
