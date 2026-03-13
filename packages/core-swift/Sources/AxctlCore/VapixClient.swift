import Foundation
import CryptoKit

/// HTTP Digest Authentication + VAPIX API client for Axis cameras.
public actor VapixClient {
    public let host: String
    private let username: String
    private let password: String
    private let session: URLSession

    public init(host: String, username: String, password: String) {
        self.host = host
        self.username = username
        self.password = password
        self.session = URLSession(configuration: .ephemeral)
    }

    // MARK: - Digest Auth

    private struct DigestChallenge {
        let realm: String
        let nonce: String
        let qop: String?
        let opaque: String?
    }

    private func parseChallenge(_ header: String) -> DigestChallenge? {
        guard header.lowercased().hasPrefix("digest ") else { return nil }
        var params: [String: String] = [:]
        let regex = try? NSRegularExpression(pattern: #"(\w+)="([^"]*)""#)
        let range = NSRange(header.startIndex..., in: header)
        regex?.enumerateMatches(in: header, range: range) { match, _, _ in
            guard let match = match,
                  let keyRange = Range(match.range(at: 1), in: header),
                  let valRange = Range(match.range(at: 2), in: header) else { return }
            params[String(header[keyRange])] = String(header[valRange])
        }
        guard let realm = params["realm"], let nonce = params["nonce"] else { return nil }
        return DigestChallenge(realm: realm, nonce: nonce, qop: params["qop"], opaque: params["opaque"])
    }

    private func md5(_ input: String) -> String {
        let digest = Insecure.MD5.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func buildAuthHeader(method: String, uri: String, challenge: DigestChallenge) -> String {
        let ha1 = md5("\(username):\(challenge.realm):\(password)")
        let ha2 = md5("\(method):\(uri)")
        let nc = "00000001"
        let cnonce = md5("\(Date().timeIntervalSince1970)\(Int.random(in: 0...999999))")

        let response: String
        if challenge.qop == "auth" {
            response = md5("\(ha1):\(challenge.nonce):\(nc):\(cnonce):auth:\(ha2)")
        } else {
            response = md5("\(ha1):\(challenge.nonce):\(ha2)")
        }

        var parts = [
            "username=\"\(username)\"",
            "realm=\"\(challenge.realm)\"",
            "nonce=\"\(challenge.nonce)\"",
            "uri=\"\(uri)\"",
            "response=\"\(response)\""
        ]
        if challenge.qop == "auth" {
            parts.append(contentsOf: ["qop=auth", "nc=\(nc)", "cnonce=\"\(cnonce)\""])
        }
        if let opaque = challenge.opaque {
            parts.append("opaque=\"\(opaque)\"")
        }
        return "Digest \(parts.joined(separator: ", "))"
    }

    /// Perform an HTTP request with Digest Authentication.
    public func digestRequest(_ url: URL, method: String = "GET") async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = method

        // First request — expect 401
        let (_, firstResponse) = try await session.data(for: request)
        guard let httpResponse = firstResponse as? HTTPURLResponse else {
            throw VapixError.invalidResponse
        }

        if httpResponse.statusCode != 401 {
            let (data, _) = try await session.data(for: request)
            return (data, httpResponse)
        }

        guard let wwwAuth = httpResponse.value(forHTTPHeaderField: "WWW-Authenticate"),
              let challenge = parseChallenge(wwwAuth) else {
            throw VapixError.authenticationFailed
        }

        let uri = url.path + (url.query.map { "?\($0)" } ?? "")
        let auth = buildAuthHeader(method: method, uri: uri, challenge: challenge)

        var authRequest = URLRequest(url: url)
        authRequest.httpMethod = method
        authRequest.setValue(auth, forHTTPHeaderField: "Authorization")

        let (data, authResponse) = try await session.data(for: authRequest)
        guard let httpAuthResponse = authResponse as? HTTPURLResponse else {
            throw VapixError.invalidResponse
        }

        guard httpAuthResponse.statusCode == 200 else {
            throw VapixError.httpError(httpAuthResponse.statusCode)
        }

        return (data, httpAuthResponse)
    }

    // MARK: - VAPIX API

    /// Device properties returned by basicdeviceinfo.cgi.
    public struct DeviceInfo: Codable, Sendable {
        public let ProdFullName: String
        public let SerialNumber: String
        public let Version: String
        public let Architecture: String?
        public let Brand: String?
        public let HardwareID: String?
    }

    /// Get basic device information.
    public func getDeviceInfo() async throws -> DeviceInfo {
        let url = URL(string: "http://\(host)/axis-cgi/basicdeviceinfo.cgi")!
        let (data, _) = try await digestRequest(url)

        struct Response: Codable {
            struct DataWrapper: Codable {
                let propertyList: DeviceInfo
            }
            let data: DataWrapper
        }

        let decoded = try JSONDecoder().decode(Response.self, from: data)
        return decoded.data.propertyList
    }

    /// Check if the camera is reachable.
    public func ping() async -> Bool {
        do {
            _ = try await getDeviceInfo()
            return true
        } catch {
            return false
        }
    }

    /// Capture a JPEG snapshot.
    public func captureSnapshot(resolution: String? = nil, channel: Int? = nil) async throws -> Data {
        var components = URLComponents(string: "http://\(host)/axis-cgi/jpg/image.cgi")!
        var queryItems: [URLQueryItem] = []
        if let resolution { queryItems.append(URLQueryItem(name: "resolution", value: resolution)) }
        if let channel { queryItems.append(URLQueryItem(name: "camera", value: String(channel))) }
        if !queryItems.isEmpty { components.queryItems = queryItems }

        let (data, _) = try await digestRequest(components.url!)
        return data
    }

    /// Get firmware version string.
    public func getFirmwareVersion() async throws -> String {
        let info = try await getDeviceInfo()
        return info.Version
    }
}

// MARK: - Errors

public enum VapixError: Error, LocalizedError {
    case invalidResponse
    case authenticationFailed
    case httpError(Int)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Invalid HTTP response"
        case .authenticationFailed: return "Digest authentication failed"
        case .httpError(let code): return "HTTP error \(code)"
        }
    }
}
