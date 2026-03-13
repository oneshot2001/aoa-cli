import Foundation
import Security

/// Read credentials from the macOS Keychain (com.axctl.device-credentials service).
public final class KeychainReader: Sendable {
    public struct Credential: Sendable {
        public let host: String
        public let username: String
        public let password: String
    }

    public static let defaultService = "com.axctl.device-credentials"
    private let service: String

    public init(service: String = KeychainReader.defaultService) {
        self.service = service
    }

    /// Get credential for a specific host.
    public func get(host: String) -> Credential? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: host,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let username = json["username"],
              let password = json["password"] else {
            return nil
        }

        return Credential(host: host, username: username, password: password)
    }

    /// List all stored credentials.
    public func list() -> [Credential] {
        // First get the account list from the metadata entry
        let metaQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "__accounts__",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var metaResult: AnyObject?
        let metaStatus = SecItemCopyMatching(metaQuery as CFDictionary, &metaResult)

        var accounts: [String] = []
        if metaStatus == errSecSuccess,
           let data = metaResult as? Data,
           let list = String(data: data, encoding: .utf8) {
            accounts = list.components(separatedBy: ",").filter { !$0.isEmpty }
        }

        // If no metadata entry, fall back to querying all items
        if accounts.isEmpty {
            accounts = listAccounts()
        }

        return accounts.compactMap { get(host: $0) }
    }

    /// Query Keychain for all accounts under this service.
    private func listAccounts() -> [String] {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let items = result as? [[String: Any]] else {
            return []
        }

        return items.compactMap { $0[kSecAttrAccount as String] as? String }
            .filter { $0 != "__accounts__" }
    }

    /// Check if a credential exists for the given host.
    public func has(host: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: host,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
    }

    // MARK: - File Credential Fallback

    /// Read credentials from the file-based fallback (~/.axctl/credentials-<host>.json).
    public static func fromFile(host: String, directory: String? = nil) -> Credential? {
        let dir = directory ?? "\(FileManager.default.homeDirectoryForCurrentUser.path)/.axctl"
        let path = "\(dir)/credentials-\(host).json"

        guard let data = FileManager.default.contents(atPath: path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let username = json["username"],
              let password = json["password"] else {
            return nil
        }

        return Credential(host: host, username: username, password: password)
    }

    /// Try Keychain first, fall back to file credentials.
    public func getWithFallback(host: String) -> Credential? {
        get(host: host) ?? KeychainReader.fromFile(host: host)
    }
}
