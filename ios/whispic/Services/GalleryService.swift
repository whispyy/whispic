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

    /// Which endpoint the current page set came from. `loadMore()` must keep using
    /// the same one — paging a search with the timeline endpoint would silently
    /// append unfiltered assets to the search results.
    private enum Source {
        case timeline
        case search(query: String)
    }

    private var items: [AssetSummary] = []
    private var nextCursor: String?
    private var source: Source = .timeline

    private init() {}

    func refresh() async {
        await load(.timeline, replacing: true)
    }

    func search(query: String) async {
        await load(.search(query: query), replacing: true)
    }

    func loadMore() async {
        guard nextCursor != nil, !isLoadingMore else { return }
        isLoadingMore = true
        await load(source, replacing: false)
        isLoadingMore = false
    }

    private func fetchPage(_ source: Source, cursor: String?) async throws -> TimelineResponse {
        switch source {
        case .timeline:
            return try await APIClient.shared.fetchTimeline(cursor: cursor)
        case .search(let query):
            return try await APIClient.shared.searchAssets(q: query, cursor: cursor)
        }
    }

    private func load(_ source: Source, replacing: Bool) async {
        if replacing {
            isLoading = true
            error = nil
        }
        do {
            let response = try await fetchPage(source, cursor: replacing ? nil : nextCursor)
            if replacing {
                items = response.items
                self.source = source
            } else {
                items.append(contentsOf: response.items)
            }
            nextCursor = response.nextCursor
            rebuildGroups()
        } catch {
            // On a page append, leave the cursor in place so the next scroll retries.
            if replacing { self.error = error.localizedDescription }
        }
        if replacing { isLoading = false }
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
