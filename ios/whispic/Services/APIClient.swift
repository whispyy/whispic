import Foundation

enum APIError: LocalizedError {
    case noServerURL
    case noToken
    case httpError(Int, String)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .noServerURL: return "Server URL not configured"
        case .noToken:     return "Not authenticated — connect in Settings"
        case .httpError(let code, let msg): return "HTTP \(code): \(msg)"
        case .networkError(let e): return e.localizedDescription
        }
    }
}

struct ExistsResponse: Codable {
    let exists: Bool
    let assetId: String?
}

struct UploadResult: Codable {
    let id: String?
    let duplicate: Bool?
    let assetId: String?
    let takenAt: String?
    let type: String?
    let thumbStatus: String?

    /// The server-side asset id, whether this was a fresh upload or a dedup hit.
    var resolvedAssetId: String? {
        (duplicate == true) ? assetId : id
    }
}

enum AssetKind: String {
    case thumb, preview, original
}

final class APIClient {
    static let shared = APIClient()
    private let config = BackupConfig.shared

    private var baseURL: URL {
        get throws {
            let raw = config.serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !raw.isEmpty, let url = URL(string: raw) else { throw APIError.noServerURL }
            return url
        }
    }

    private var token: String {
        get throws {
            guard let t = config.sessionToken, !t.isEmpty else { throw APIError.noToken }
            return t
        }
    }

    // MARK: - Auth

    func authenticate(password: String) async throws {
        let url = try baseURL.appendingPathComponent("api/auth")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["password": password])

        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        let body = try JSONDecoder().decode([String: String].self, from: data)
        guard let t = body["token"] else { throw APIError.httpError(200, "No token in response") }
        config.sessionToken = t
    }

    // MARK: - Upload

    func checkAssetExists(sha256: String) async throws -> ExistsResponse {
        var comps = URLComponents(
            url: try baseURL.appendingPathComponent("api/assets/exists"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "sha256", value: sha256)]
        var req = URLRequest(url: comps.url!)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        return try JSONDecoder().decode(ExistsResponse.self, from: data)
    }

    func uploadAsset(
        fileData: Data,
        filename: String,
        mimeType: String,
        creationDate: String?,
        latitude: Double?,
        longitude: Double?
    ) async throws -> UploadResult {
        let url = try baseURL.appendingPathComponent("api/assets")
        let tok = try token
        let boundary = "Boundary-\(UUID().uuidString)"

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 300

        var body = Data()

        func field(_ name: String, _ value: String) {
            body += "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n"
                .data(using: .utf8)!
        }
        if let creationDate { field("creationDate", creationDate) }
        if let latitude { field("latitude", String(latitude)) }
        if let longitude { field("longitude", String(longitude)) }

        body += "--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\nContent-Type: \(mimeType)\r\n\r\n"
            .data(using: .utf8)!
        body += fileData
        body += "\r\n--\(boundary)--\r\n".data(using: .utf8)!

        req.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        return try JSONDecoder().decode(UploadResult.self, from: data)
    }

    // MARK: - Gallery

    func fetchTimeline(cursor: String? = nil, limit: Int = 200) async throws -> TimelineResponse {
        var comps = URLComponents(
            url: try baseURL.appendingPathComponent("api/timeline"),
            resolvingAgainstBaseURL: false
        )!
        var queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { queryItems.append(URLQueryItem(name: "cursor", value: cursor)) }
        comps.queryItems = queryItems

        var req = URLRequest(url: comps.url!)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        return try JSONDecoder().decode(TimelineResponse.self, from: data)
    }

    func assetRequest(id: String, kind: AssetKind) throws -> URLRequest {
        let url = try baseURL.appendingPathComponent("api/assets/\(id)/\(kind.rawValue)")
        var req = URLRequest(url: url)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        return req
    }

    func searchAssets(
        q: String? = nil,
        type: String? = nil,
        camera: String? = nil,
        place: String? = nil,
        favorite: Bool? = nil,
        from: String? = nil,
        to: String? = nil,
        cursor: String? = nil,
        limit: Int = 200
    ) async throws -> TimelineResponse {
        var comps = URLComponents(
            url: try baseURL.appendingPathComponent("api/search"),
            resolvingAgainstBaseURL: false
        )!
        var queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        if let q, !q.isEmpty { queryItems.append(URLQueryItem(name: "q", value: q)) }
        if let type { queryItems.append(URLQueryItem(name: "type", value: type)) }
        if let camera, !camera.isEmpty { queryItems.append(URLQueryItem(name: "camera", value: camera)) }
        if let place, !place.isEmpty { queryItems.append(URLQueryItem(name: "place", value: place)) }
        if favorite == true { queryItems.append(URLQueryItem(name: "favorite", value: "true")) }
        if let from { queryItems.append(URLQueryItem(name: "from", value: from)) }
        if let to { queryItems.append(URLQueryItem(name: "to", value: to)) }
        if let cursor { queryItems.append(URLQueryItem(name: "cursor", value: cursor)) }
        comps.queryItems = queryItems

        var req = URLRequest(url: comps.url!)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        return try JSONDecoder().decode(TimelineResponse.self, from: data)
    }

    // MARK: - Favorites & trash

    func toggleFavorite(id: String) async throws -> Bool {
        let url = try baseURL.appendingPathComponent("api/assets/\(id)/favorite")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        struct Resp: Codable { let favorite: Bool }
        return try JSONDecoder().decode(Resp.self, from: data).favorite
    }

    func trashAsset(id: String) async throws {
        let url = try baseURL.appendingPathComponent("api/assets/\(id)")
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
    }

    func restoreAsset(id: String) async throws {
        let url = try baseURL.appendingPathComponent("api/assets/\(id)/restore")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
    }

    func fetchTrash() async throws -> [AssetSummary] {
        let url = try baseURL.appendingPathComponent("api/trash")
        var req = URLRequest(url: url)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        struct Resp: Codable { let items: [AssetSummary] }
        return try JSONDecoder().decode(Resp.self, from: data).items
    }

    // MARK: - Albums

    func fetchAlbums() async throws -> [Album] {
        let url = try baseURL.appendingPathComponent("api/albums")
        var req = URLRequest(url: url)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        struct Resp: Codable { let items: [Album] }
        return try JSONDecoder().decode(Resp.self, from: data).items
    }

    func createAlbum(name: String) async throws -> Album {
        let url = try baseURL.appendingPathComponent("api/albums")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["name": name])
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        return try JSONDecoder().decode(Album.self, from: data)
    }

    func renameAlbum(id: String, name: String) async throws -> Album {
        let url = try baseURL.appendingPathComponent("api/albums/\(id)")
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["name": name])
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        return try JSONDecoder().decode(Album.self, from: data)
    }

    func deleteAlbum(id: String) async throws {
        let url = try baseURL.appendingPathComponent("api/albums/\(id)")
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
    }

    func fetchAlbum(id: String) async throws -> (album: Album, items: [AssetSummary]) {
        let url = try baseURL.appendingPathComponent("api/albums/\(id)")
        var req = URLRequest(url: url)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        struct Resp: Codable { let album: Album; let items: [AssetSummary] }
        let decoded = try JSONDecoder().decode(Resp.self, from: data)
        return (decoded.album, decoded.items)
    }

    func addAsset(_ assetId: String, toAlbum albumId: String) async throws {
        let url = try baseURL.appendingPathComponent("api/albums/\(albumId)/assets")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["assetId": assetId])
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
    }

    func removeAsset(_ assetId: String, fromAlbum albumId: String) async throws {
        let url = try baseURL.appendingPathComponent("api/albums/\(albumId)/assets/\(assetId)")
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
    }

    // MARK: - Private

    private func checkHTTP(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }
        guard http.statusCode < 400 else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw APIError.httpError(http.statusCode, msg)
        }
    }
}
