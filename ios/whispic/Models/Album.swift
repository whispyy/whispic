import Foundation

/// Server-side manual album (GET/POST /api/albums)
struct Album: Codable, Identifiable {
    let id: String
    let name: String
    let coverAssetId: String?
    let assetCount: Int
    let createdAt: String
}
