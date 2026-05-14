import Foundation

struct AlbumSelection: Codable, Identifiable, Equatable {
    let albumId: String
    let albumName: String
    var enabled: Bool
    var fromDate: Date? = nil
    var toDate: Date? = nil

    var id: String { albumId }
}

extension UserDefaults {
    private static let albumsKey = "albumSelections"

    func loadAlbumSelections() -> [AlbumSelection] {
        guard let data = data(forKey: Self.albumsKey) else { return [] }
        return (try? JSONDecoder().decode([AlbumSelection].self, from: data)) ?? []
    }

    func saveAlbumSelections(_ selections: [AlbumSelection]) {
        guard let data = try? JSONEncoder().encode(selections) else { return }
        set(data, forKey: Self.albumsKey)
    }
}
