import Foundation
import Observation

@Observable
@MainActor
final class GalleryService {
    static let shared = GalleryService()

    var groups: [GalleryGroup] = []
    var isLoading = false
    var isLoadingMore = false
    var error: String?

    private var items: [AssetSummary] = []
    private var nextCursor: String?

    private init() {}

    func refresh() async {
        isLoading = true
        error = nil
        do {
            let response = try await APIClient.shared.fetchTimeline()
            items = response.items
            nextCursor = response.nextCursor
            rebuildGroups()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        do {
            let response = try await APIClient.shared.fetchTimeline(cursor: cursor)
            items.append(contentsOf: response.items)
            nextCursor = response.nextCursor
            rebuildGroups()
        } catch {
            // Leave cursor in place; the next scroll trigger will retry.
        }
        isLoadingMore = false
    }

    func search(query: String) async {
        isLoading = true
        error = nil
        do {
            let response = try await APIClient.shared.searchAssets(q: query)
            items = response.items
            nextCursor = response.nextCursor
            rebuildGroups()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func setFavorite(_ id: String, favorite: Bool) {
        guard let idx = items.firstIndex(where: { $0.id == id }) else { return }
        let f = items[idx]
        items[idx] = AssetSummary(
            id: f.id, takenAt: f.takenAt, type: f.type, width: f.width, height: f.height,
            durationS: f.durationS, favorite: favorite, hasThumb: f.hasThumb
        )
        rebuildGroups()
    }

    func removeAsset(_ id: String) {
        items.removeAll { $0.id == id }
        rebuildGroups()
    }

    private func rebuildGroups() {
        var byDate: [String: [AssetSummary]] = [:]
        for item in items {
            byDate[item.dateKey, default: []].append(item)
        }
        // Server already returns items ordered taken_at DESC, so within-day
        // insertion order is preserved without re-sorting.
        groups = byDate
            .sorted { $0.key > $1.key }
            .map { GalleryGroup(date: $0.key, files: $0.value) }
    }
}
