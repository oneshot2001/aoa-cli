import XCTest
@testable import AxctlCore

final class VapixClientTests: XCTestCase {
    func testVapixClientInit() async {
        let client = VapixClient(host: "192.168.1.100", username: "root", password: "pass")
        let host = await client.host
        XCTAssertEqual(host, "192.168.1.100")
    }

    func testVapixErrorDescriptions() {
        XCTAssertEqual(VapixError.invalidResponse.errorDescription, "Invalid HTTP response")
        XCTAssertEqual(VapixError.authenticationFailed.errorDescription, "Digest authentication failed")
        XCTAssertEqual(VapixError.httpError(404).errorDescription, "HTTP error 404")
    }

    func testDeviceInfoCodable() throws {
        let json = """
        {
            "ProdFullName": "AXIS M3106-LVE Mk II",
            "SerialNumber": "ACCC8E123456",
            "Version": "11.6.94",
            "Architecture": "armv7hf",
            "Brand": "AXIS",
            "HardwareID": "7D2"
        }
        """
        let data = json.data(using: .utf8)!
        let info = try JSONDecoder().decode(VapixClient.DeviceInfo.self, from: data)
        XCTAssertEqual(info.ProdFullName, "AXIS M3106-LVE Mk II")
        XCTAssertEqual(info.SerialNumber, "ACCC8E123456")
        XCTAssertEqual(info.Version, "11.6.94")
        XCTAssertEqual(info.Architecture, "armv7hf")
        XCTAssertEqual(info.Brand, "AXIS")
        XCTAssertEqual(info.HardwareID, "7D2")
    }

    func testDeviceInfoMinimalFields() throws {
        let json = """
        {
            "ProdFullName": "AXIS P1448-LE",
            "SerialNumber": "ACCC8E654321",
            "Version": "10.12.1"
        }
        """
        let data = json.data(using: .utf8)!
        let info = try JSONDecoder().decode(VapixClient.DeviceInfo.self, from: data)
        XCTAssertEqual(info.ProdFullName, "AXIS P1448-LE")
        XCTAssertNil(info.Architecture)
        XCTAssertNil(info.Brand)
        XCTAssertNil(info.HardwareID)
    }
}
