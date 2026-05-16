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

    func uploadPhoto(fileData: Data, filename: String, subpath: String) async throws {
        let url = try baseURL.appendingPathComponent("api/upload")
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
        field("folderKey", "photos")
        field("subpath", subpath)
        field("filenameOverride", filename)
        field("thumbnail", "on")

        body += "--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\nContent-Type: application/octet-stream\r\n\r\n"
            .data(using: .utf8)!
        body += fileData
        body += "\r\n--\(boundary)--\r\n".data(using: .utf8)!

        req.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
    }

    // MARK: - Gallery

    func fetchGallery() async throws -> BrowseRecursiveResponse {
        var comps = URLComponents(
            url: try baseURL.appendingPathComponent("api/browse/photos"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "recursive", value: "true")]
        var req = URLRequest(url: comps.url!)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: req)
        try checkHTTP(response, data)
        return try JSONDecoder().decode(BrowseRecursiveResponse.self, from: data)
    }

    func photoRequest(for file: GalleryFile) throws -> URLRequest {
        let base = try baseURL
        var comps = URLComponents(
            url: base.appendingPathComponent("api/browse/photos/\(file.filename)"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "subpath", value: file.subpath)]
        var req = URLRequest(url: comps.url!)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        return req
    }

    func thumbnailRequest(for file: GalleryFile) throws -> URLRequest {
        let base = try baseURL
        var comps = URLComponents(
            url: base.appendingPathComponent("api/browse/photos/\(file.filename)"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "subpath", value: file.subpath + "/.thumbnails")]
        var req = URLRequest(url: comps.url!)
        req.setValue("Bearer \(try token)", forHTTPHeaderField: "Authorization")
        return req
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
