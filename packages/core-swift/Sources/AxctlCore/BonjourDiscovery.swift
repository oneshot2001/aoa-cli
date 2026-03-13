import Foundation
import Network

/// Discovers Axis cameras on the local network via mDNS/Bonjour.
public final class BonjourDiscovery: @unchecked Sendable {
    public struct DiscoveredDevice: Sendable {
        public let name: String
        public let host: String
        public let port: UInt16
        public let txtRecord: [String: String]
    }

    private let browser: NWBrowser
    private let queue = DispatchQueue(label: "com.axctl.bonjour")
    private var discovered: [DiscoveredDevice] = []
    private var continuation: AsyncStream<DiscoveredDevice>.Continuation?

    public init(serviceType: String = "_axis-video._tcp") {
        let descriptor = NWBrowser.Descriptor.bonjour(type: serviceType, domain: "local.")
        self.browser = NWBrowser(for: descriptor, using: .tcp)
    }

    /// Returns an async stream of discovered devices. Runs until cancelled or `stop()` is called.
    public func discover() -> AsyncStream<DiscoveredDevice> {
        AsyncStream { continuation in
            self.continuation = continuation

            browser.browseResultsChangedHandler = { [weak self] results, changes in
                guard let self else { return }
                for change in changes {
                    switch change {
                    case .added(let result):
                        self.resolve(result)
                    case .removed, .changed, .identical:
                        break
                    @unknown default:
                        break
                    }
                }
            }

            browser.stateUpdateHandler = { [weak self] state in
                switch state {
                case .failed:
                    self?.continuation?.finish()
                case .cancelled:
                    self?.continuation?.finish()
                default:
                    break
                }
            }

            continuation.onTermination = { [weak self] _ in
                self?.browser.cancel()
            }

            browser.start(queue: queue)
        }
    }

    /// Resolve an NWBrowser.Result to get host/port/TXT.
    private func resolve(_ result: NWBrowser.Result) {
        let connection = NWConnection(to: result.endpoint, using: .tcp)
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                if let path = connection.currentPath,
                   let endpoint = path.remoteEndpoint {
                    let device = self.makeDevice(from: result, resolved: endpoint)
                    self.continuation?.yield(device)
                }
                connection.cancel()
            case .failed, .cancelled:
                connection.cancel()
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    private func makeDevice(from result: NWBrowser.Result, resolved: NWEndpoint) -> DiscoveredDevice {
        let name: String
        switch result.endpoint {
        case .service(let n, _, _, _):
            name = n
        default:
            name = "Unknown"
        }

        let host: String
        let port: UInt16
        switch resolved {
        case .hostPort(let h, let p):
            host = "\(h)"
            port = p.rawValue
        default:
            host = "unknown"
            port = 0
        }

        var txt: [String: String] = [:]
        if case .bonjour(let record) = result.metadata {
            for (key, value) in record.dictionary {
                txt[key] = value
            }
        }

        return DiscoveredDevice(name: name, host: host, port: port, txtRecord: txt)
    }

    /// Stop browsing.
    public func stop() {
        browser.cancel()
        continuation?.finish()
    }

    /// One-shot discovery: browse for a duration, return all found devices.
    public static func scan(duration: TimeInterval = 5.0, serviceType: String = "_axis-video._tcp") async -> [DiscoveredDevice] {
        let discovery = BonjourDiscovery(serviceType: serviceType)
        var devices: [DiscoveredDevice] = []

        let task = Task {
            for await device in discovery.discover() {
                devices.append(device)
            }
        }

        try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
        discovery.stop()
        task.cancel()

        return devices
    }
}

// MARK: - NWBrowser.Result.MetadataChanges helpers

extension NWBrowser.Result.Change {
    var isAdded: Bool {
        if case .added = self { return true }
        return false
    }
}
