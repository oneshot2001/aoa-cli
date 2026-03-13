import XCTest
#if canImport(SQLite3)
import SQLite3
#endif
@testable import AxctlCore

final class RegistryReaderTests: XCTestCase {
    var tempDir: URL!
    var dbPath: String!

    override func setUpWithError() throws {
        tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        dbPath = tempDir.appendingPathComponent("devices.db").path
        try createTestDb()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempDir)
    }

    private func createTestDb() throws {
        var db: OpaquePointer?
        guard sqlite3_open(dbPath, &db) == SQLITE_OK, let db else {
            throw NSError(domain: "test", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create test DB"])
        }
        defer { sqlite3_close(db) }

        let schema = """
        CREATE TABLE devices (
            ip TEXT PRIMARY KEY,
            mac TEXT,
            model TEXT,
            serial_number TEXT,
            firmware_version TEXT,
            last_seen TEXT
        );
        CREATE TABLE fleets (
            name TEXT PRIMARY KEY,
            description TEXT
        );
        CREATE TABLE fleet_members (
            fleet_name TEXT,
            device_ip TEXT,
            PRIMARY KEY (fleet_name, device_ip),
            FOREIGN KEY (fleet_name) REFERENCES fleets(name) ON DELETE CASCADE
        );
        CREATE TABLE profiles (
            name TEXT PRIMARY KEY,
            settings TEXT DEFAULT '{}'
        );
        CREATE TABLE config (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        INSERT INTO devices VALUES ('192.168.1.10', 'AA:BB:CC:DD:EE:01', 'M3106-LVE', 'ACCC8E001', '11.6.94', '2026-03-13');
        INSERT INTO devices VALUES ('192.168.1.11', 'AA:BB:CC:DD:EE:02', 'P1448-LE', 'ACCC8E002', '10.12.1', '2026-03-13');

        INSERT INTO fleets VALUES ('lobby', 'Lobby cameras');
        INSERT INTO fleet_members VALUES ('lobby', '192.168.1.10');
        INSERT INTO fleet_members VALUES ('lobby', '192.168.1.11');

        INSERT INTO profiles VALUES ('default', '{"output":"table"}');
        INSERT INTO profiles VALUES ('json', '{"output":"json"}');
        INSERT INTO config VALUES ('active_profile', 'default');
        """

        var errMsg: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(db, schema, nil, nil, &errMsg) == SQLITE_OK else {
            let msg = errMsg.map { String(cString: $0) } ?? "Unknown"
            sqlite3_free(errMsg)
            throw NSError(domain: "test", code: 2, userInfo: [NSLocalizedDescriptionKey: msg])
        }
    }

    func testListDevices() throws {
        let reader = RegistryReader(dbPath: dbPath)
        let devices = try reader.listDevices()
        XCTAssertEqual(devices.count, 2)
        XCTAssertEqual(devices[0].ip, "192.168.1.10")
        XCTAssertEqual(devices[0].model, "M3106-LVE")
        XCTAssertEqual(devices[1].ip, "192.168.1.11")
    }

    func testGetDevice() throws {
        let reader = RegistryReader(dbPath: dbPath)
        let device = try reader.getDevice(ip: "192.168.1.10")
        XCTAssertNotNil(device)
        XCTAssertEqual(device?.serialNumber, "ACCC8E001")
        XCTAssertEqual(device?.firmwareVersion, "11.6.94")
    }

    func testGetDeviceNotFound() throws {
        let reader = RegistryReader(dbPath: dbPath)
        let device = try reader.getDevice(ip: "10.0.0.1")
        XCTAssertNil(device)
    }

    func testListFleets() throws {
        let reader = RegistryReader(dbPath: dbPath)
        let fleets = try reader.listFleets()
        XCTAssertEqual(fleets.count, 1)
        XCTAssertEqual(fleets[0].name, "lobby")
        XCTAssertEqual(fleets[0].members.count, 2)
        XCTAssertTrue(fleets[0].members.contains("192.168.1.10"))
    }

    func testListProfiles() throws {
        let reader = RegistryReader(dbPath: dbPath)
        let profiles = try reader.listProfiles()
        XCTAssertEqual(profiles.count, 2)
        let defaultProfile = profiles.first { $0.isDefault }
        XCTAssertNotNil(defaultProfile)
        XCTAssertEqual(defaultProfile?.name, "default")
    }

    func testGetConfig() throws {
        let reader = RegistryReader(dbPath: dbPath)
        let value = try reader.getConfig(key: "active_profile")
        XCTAssertEqual(value, "default")
    }

    func testGetConfigMissing() throws {
        let reader = RegistryReader(dbPath: dbPath)
        let value = try reader.getConfig(key: "nonexistent")
        XCTAssertNil(value)
    }

    func testDbNotFound() {
        let reader = RegistryReader(dbPath: "/tmp/nonexistent_\(UUID().uuidString).db")
        XCTAssertFalse(reader.exists)
    }

    func testDbExists() {
        let reader = RegistryReader(dbPath: dbPath)
        XCTAssertTrue(reader.exists)
    }
}
