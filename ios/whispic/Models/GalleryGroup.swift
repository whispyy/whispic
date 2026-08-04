import Foundation

/// One item from GET /api/timeline
struct AssetSummary: Codable, Identifiable {
    let id: String
    let takenAt: String       // ISO8601 local capture time, e.g. "2026-05-13T10:00:00"
    let type: String          // "photo" | "video"
    let width: Int?
    let height: Int?
    let durationS: Double?
    let favorite: Bool
    let hasThumb: Bool

    var isVideo: Bool { type == "video" }

    /// "2026-05-13" derived from the takenAt prefix
    var dateKey: String { String(takenAt.prefix(10)) }

    /// "May 13, 2026 at 10:00 AM" for display in the lightbox/detail view
    var takenAtDisplay: String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        guard let d = parser.date(from: takenAt) else { return takenAt }
        let out = DateFormatter()
        out.dateStyle = .medium
        out.timeStyle = .short
        return out.string(from: d)
    }
}

/// Server response shape for GET /api/timeline
struct TimelineResponse: Codable {
    let items: [AssetSummary]
    let nextCursor: String?
}

/// Client-side grouping of AssetSummary by date
struct GalleryGroup: Identifiable {
    let date: String        // "2026-05-13"
    let files: [AssetSummary]

    var id: String { date }

    var displayDate: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: date) else { return date }
        f.dateStyle = .long
        f.timeStyle = .none
        return f.string(from: d)
    }
}
