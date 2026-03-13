import Foundation
#if canImport(SQLite3)
import SQLite3
#endif

/// Read-only access to the shared axctl SQLite device registry (~/.axctl/devices.db).
public final class RegistryReader: Sendable {
    public struct Device: Sendable {
        public let ip: String
        public let mac: String?
        public let model: String?
        public let serialNumber: String?
        public let firmwareVersion: String?
        public let lastSeen: String?
    }

    public struct Fleet: Sendable {
        public let name: String
        public let description: String?
        public let members: [String] // IPs
    }

    public struct Profile: Sendable {
        public let name: String
        public let settings: String // JSON blob
        public let isDefault: Bool
    }

    private let dbPath: String

    public init(dbPath: String? = nil) {
        if let dbPath {
            self.dbPath = dbPath
        } else {
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            self.dbPath = "\(home)/.axctl/devices.db"
        }
    }

    /// Check if the database file exists.
    public var exists: Bool {
        FileManager.default.fileExists(atPath: dbPath)
    }

    // MARK: - Devices

    public func listDevices() throws -> [Device] {
        try query("SELECT ip, mac, model, serial_number, firmware_version, last_seen FROM devices ORDER BY ip") { stmt in
            Device(
                ip: column(stmt, 0) ?? "",
                mac: column(stmt, 1),
                model: column(stmt, 2),
                serialNumber: column(stmt, 3),
                firmwareVersion: column(stmt, 4),
                lastSeen: column(stmt, 5)
            )
        }
    }

    public func getDevice(ip: String) throws -> Device? {
        let results: [Device] = try query("SELECT ip, mac, model, serial_number, firmware_version, last_seen FROM devices WHERE ip = ?", bind: [ip]) { stmt in
            Device(
                ip: column(stmt, 0) ?? "",
                mac: column(stmt, 1),
                model: column(stmt, 2),
                serialNumber: column(stmt, 3),
                firmwareVersion: column(stmt, 4),
                lastSeen: column(stmt, 5)
            )
        }
        return results.first
    }

    // MARK: - Fleets

    public func listFleets() throws -> [Fleet] {
        let db = try openDb()
        defer { sqlite3_close(db) }

        var fleets: [Fleet] = []
        let fleetRows: [(String, String?)] = try queryWith(db: db, sql: "SELECT name, description FROM fleets ORDER BY name") { stmt in
            (column(stmt, 0) ?? "", column(stmt, 1))
        }

        for (name, desc) in fleetRows {
            let members: [String] = try queryWith(db: db, sql: "SELECT device_ip FROM fleet_members WHERE fleet_name = ?", bind: [name]) { stmt in
                column(stmt, 0) ?? ""
            }
            fleets.append(Fleet(name: name, description: desc, members: members))
        }

        return fleets
    }

    // MARK: - Profiles

    public func listProfiles() throws -> [Profile] {
        let db = try openDb()
        defer { sqlite3_close(db) }

        let defaultName: String? = try queryWith(db: db, sql: "SELECT value FROM config WHERE key = 'active_profile'") { stmt in
            column(stmt, 0) ?? ""
        }.first

        return try queryWith(db: db, sql: "SELECT name, settings FROM profiles ORDER BY name") { stmt in
            let name: String = column(stmt, 0) ?? ""
            return Profile(name: name, settings: column(stmt, 1) ?? "{}", isDefault: name == defaultName)
        }
    }

    // MARK: - Config

    public func getConfig(key: String) throws -> String? {
        let results: [String] = try query("SELECT value FROM config WHERE key = ?", bind: [key]) { stmt in
            column(stmt, 0) ?? ""
        }
        return results.first
    }

    // MARK: - SQLite Helpers

    private func openDb() throws -> OpaquePointer {
        var db: OpaquePointer?
        let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX
        let rc = sqlite3_open_v2(dbPath, &db, flags, nil)
        guard rc == SQLITE_OK, let db else {
            let msg = db.map { String(cString: sqlite3_errmsg($0)) } ?? "Unknown error"
            if let db { sqlite3_close(db) }
            throw RegistryError.openFailed(msg)
        }
        return db
    }

    private func query<T>(_ sql: String, bind: [String] = [], _ transform: (OpaquePointer) -> T) throws -> [T] {
        let db = try openDb()
        defer { sqlite3_close(db) }
        return try queryWith(db: db, sql: sql, bind: bind, transform)
    }

    private func queryWith<T>(db: OpaquePointer, sql: String, bind: [String] = [], _ transform: (OpaquePointer) -> T) throws -> [T] {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else {
            let msg = String(cString: sqlite3_errmsg(db))
            throw RegistryError.queryFailed(msg)
        }
        defer { sqlite3_finalize(stmt) }

        for (i, value) in bind.enumerated() {
            sqlite3_bind_text(stmt, Int32(i + 1), (value as NSString).utf8String, -1, nil)
        }

        var results: [T] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            results.append(transform(stmt))
        }
        return results
    }

    private func column(_ stmt: OpaquePointer, _ index: Int32) -> String? {
        guard let cStr = sqlite3_column_text(stmt, index) else { return nil }
        return String(cString: cStr)
    }
}

// MARK: - Errors

public enum RegistryError: Error, LocalizedError {
    case openFailed(String)
    case queryFailed(String)

    public var errorDescription: String? {
        switch self {
        case .openFailed(let msg): return "Failed to open registry: \(msg)"
        case .queryFailed(let msg): return "Query failed: \(msg)"
        }
    }
}
