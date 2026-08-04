import Foundation
import Photos
import UniformTypeIdentifiers

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
                let export = try await photoLibrary.exportOriginal(for: item.asset)
                defer { try? FileManager.default.removeItem(at: export.fileURL) }
                await MainActor.run { session.currentFilename = export.filename }

                let serverAssetId = try await resolveServerAssetId(export: export, asset: item.asset)

                try store.markBackedUp(BackedUpAsset(
                    assetId:       item.asset.localIdentifier,
                    filename:      export.filename,
                    albumId:       item.albumId,
                    sha256:        export.sha256,
                    serverAssetId: serverAssetId,
                    backedUpAt:    Date()
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

    /// Skips the upload entirely if the server already has this content (by hash),
    /// which makes cross-device / reinstall backups idempotent and resumable.
    private func resolveServerAssetId(
        export: ExportedOriginal,
        asset: PHAsset
    ) async throws -> String {
        let existing = try await api.checkAssetExists(sha256: export.sha256)
        if existing.exists, let id = existing.assetId {
            return id
        }

        let location = asset.location
        let result = try await api.uploadAsset(
            fileURL: export.fileURL,
            filename: export.filename,
            mimeType: mimeType(for: export.filename),
            creationDate: asset.creationDate.map(isoLocal),
            latitude: location?.coordinate.latitude,
            longitude: location?.coordinate.longitude
        )
        guard let id = result.resolvedAssetId else {
            throw NSError(
                domain: "BackupService", code: 2,
                userInfo: [NSLocalizedDescriptionKey: "No asset id in upload response"]
            )
        }
        return id
    }

    private func isoLocal(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return f.string(from: date)
    }

    private func mimeType(for filename: String) -> String {
        let ext = (filename as NSString).pathExtension
        return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }
}
