import Foundation
import Observation

@Observable
@MainActor
final class GalleryService {
    static let shared = GalleryService()

    var groups: [GalleryGroup] = []
    var isLoading = false
    var error: String?

    private init() {}

    func refresh() async {
        isLoading = true
        error = nil
        do {
            let response = try await APIClient.shared.fetchGallery()
            let thumbPaths = Set(
                response.files
                    .filter { $0.path.contains("/.thumbnails/") }
                    .map { $0.path.replacingOccurrences(of: "/.thumbnails/", with: "/") }
            )
            var byDate: [String: [GalleryFile]] = [:]
            for file in response.files where !file.path.contains("/.thumbnails/") {
                var f = file
                f.hasThumbnail = thumbPaths.contains(file.path)
                byDate[f.dateKey, default: []].append(f)
            }
            groups = byDate
                .sorted { $0.key > $1.key }
                .map { GalleryGroup(date: $0.key, files: $0.value.sorted { $0.path < $1.path }) }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
