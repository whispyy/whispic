import Foundation

/// One file entry from GET /api/browse/:folderKey?recursive=true
struct GalleryFile: Codable, Identifiable {
    let name: String
    let path: String        // e.g. "2026/05/13/IMG_0042.jpg"
    let size: Int
    let modifiedAt: String

    var id: String { path }

    /// Last path component: "IMG_0042.jpg"
    var filename: String { (path as NSString).lastPathComponent }

    /// Directory portion: "2026/05/13"
    var subpath: String { (path as NSString).deletingLastPathComponent }

    /// "2026-05-13" derived from "2026/05/13/..." path prefix
    var dateKey: String {
        let parts = path.split(separator: "/", maxSplits: 3)
        guard parts.count >= 3 else { return "Unknown" }
        return "\(parts[0])-\(parts[1])-\(parts[2])"
    }
}

/// Server response shape
struct BrowseRecursiveResponse: Codable {
    let files: [GalleryFile]
    let total: Int
}

/// Client-side grouping of GalleryFiles by date
struct GalleryGroup: Identifiable {
    let date: String        // "2026-05-13"
    let files: [GalleryFile]

    var id: String { date }

    var displayDate: String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: date) else { return date }
        f.dateStyle = .long
        f.timeStyle = .none
        return f.string(from: d)
    }
}
