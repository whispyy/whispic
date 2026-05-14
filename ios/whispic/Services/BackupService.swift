import Foundation
import Photos

final class BackupService {
    static let shared = BackupService()
    private let photoLibrary = PhotoLibraryService.shared
    private let api          = APIClient.shared
    private let store        = BackupStore.shared
    private let session      = BackupSession.shared

    func startBackup(albumSelections: [AlbumSelection]) async {
        guard !session.isRunning else { return }

        let albumsById = Dictionary(uniqueKeysWithValues:
            photoLibrary.fetchAllAlbums().map { ($0.id, $0) }
        )

        var queue: [(asset: PHAsset, albumId: String)] = []
        for sel in albumSelections where sel.enabled {
            guard let info = albumsById[sel.albumId] else { continue }
            let assets = photoLibrary.fetchAssets(in: info.collection, from: sel.fromDate, to: sel.toDate)
            let done = (try? store.backedUpIds(inAlbum: sel.albumId)) ?? []
            for asset in assets where !done.contains(asset.localIdentifier) {
                queue.append((asset, sel.albumId))
            }
        }

        await MainActor.run { session.reset(total: queue.count) }
        guard !queue.isEmpty else { await MainActor.run { session.finish() }; return }

        for item in queue {
            guard session.isRunning else { break }
            do {
                let (data, filename) = try await photoLibrary.fetchOriginalData(for: item.asset)
                let subpath = datePath(for: item.asset)
                await MainActor.run { session.currentFilename = filename }

                try await api.uploadPhoto(fileData: data, filename: filename, subpath: subpath)
                try store.markBackedUp(BackedUpAsset(
                    assetId:    item.asset.localIdentifier,
                    filename:   filename,
                    albumId:    item.albumId,
                    backedUpAt: Date()
                ))
                await MainActor.run { session.uploaded += 1 }
            } catch {
                await MainActor.run {
                    session.failed += 1
                    session.lastError = error.localizedDescription
                }
            }
        }

        await MainActor.run { session.finish() }
    }

    private func datePath(for asset: PHAsset) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy/MM/dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: asset.creationDate ?? Date())
    }
}
