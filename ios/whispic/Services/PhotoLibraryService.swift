import Foundation
import Photos
import CryptoKit

struct AlbumInfo: Identifiable {
    let id: String
    let name: String
    let assetCount: Int
    let collection: PHAssetCollection
}

final class PhotoLibraryService {
    static let shared = PhotoLibraryService()

    func requestAuthorization() async -> PHAuthorizationStatus {
        await PHPhotoLibrary.requestAuthorization(for: .readWrite)
    }

    func fetchAllAlbums() -> [AlbumInfo] {
        var albums: [AlbumInfo] = []

        let smartSubtypes: [PHAssetCollectionSubtype] = [
            .smartAlbumUserLibrary, .smartAlbumFavorites,
            .smartAlbumVideos, .smartAlbumSelfPortraits, .smartAlbumScreenshots,
        ]
        for subtype in smartSubtypes {
            PHAssetCollection
                .fetchAssetCollections(with: .smartAlbum, subtype: subtype, options: nil)
                .enumerateObjects { col, _, _ in
                    let count = PHAsset.fetchAssets(in: col, options: nil).count
                    if count > 0 {
                        albums.append(AlbumInfo(
                            id: col.localIdentifier,
                            name: col.localizedTitle ?? "Untitled",
                            assetCount: count,
                            collection: col
                        ))
                    }
                }
        }

        PHAssetCollection
            .fetchAssetCollections(with: .album, subtype: .albumRegular, options: nil)
            .enumerateObjects { col, _, _ in
                let count = PHAsset.fetchAssets(in: col, options: nil).count
                albums.append(AlbumInfo(
                    id: col.localIdentifier,
                    name: col.localizedTitle ?? "Untitled",
                    assetCount: count,
                    collection: col
                ))
            }

        return albums
    }

    func fetchAssets(
        in collection: PHAssetCollection,
        from fromDate: Date?,
        to toDate: Date?
    ) -> [PHAsset] {
        let options = PHFetchOptions()
        var predicates: [NSPredicate] = []
        if let from = fromDate { predicates.append(NSPredicate(format: "creationDate >= %@", from as NSDate)) }
        if let to   = toDate   { predicates.append(NSPredicate(format: "creationDate <= %@", to   as NSDate)) }
        if !predicates.isEmpty {
            options.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
        }
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]

        var assets: [PHAsset] = []
        PHAsset.fetchAssets(in: collection, options: options)
            .enumerateObjects { a, _, _ in assets.append(a) }
        return assets
    }

    /// Streams the asset's original bytes to a temp file and hashes them in the same
    /// pass, so nothing bigger than one chunk is ever resident — a multi-GB video used
    /// to be held in memory whole (plus again inside the multipart body), which meant a
    /// jetsam kill mid-backup. The caller owns `fileURL` and must delete it.
    func exportOriginal(for asset: PHAsset) async throws -> ExportedOriginal {
        let resources = PHAssetResource.assetResources(for: asset)
        let preferred: Set<PHAssetResourceType> = [.photo, .fullSizePhoto, .video, .fullSizeVideo, .pairedVideo]
        guard let resource = resources.first(where: { preferred.contains($0.type) }) ?? resources.first else {
            throw NSError(
                domain: "PhotoLibraryService", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "No resource found for asset"]
            )
        }

        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("whispic-upload-\(UUID().uuidString)")
        try Data().write(to: fileURL)
        let handle = try FileHandle(forWritingTo: fileURL)

        return try await withCheckedThrowingContinuation { cont in
            var hasher = SHA256()
            var writeError: Error?
            let opts = PHAssetResourceRequestOptions()
            opts.isNetworkAccessAllowed = true
            PHAssetResourceManager.default().requestData(
                for: resource,
                options: opts,
                dataReceivedHandler: { chunk in
                    guard writeError == nil else { return }
                    do {
                        try handle.write(contentsOf: chunk)
                        hasher.update(data: chunk)
                    } catch {
                        writeError = error
                    }
                },
                completionHandler: { error in
                    try? handle.close()
                    if let failure = error ?? writeError {
                        try? FileManager.default.removeItem(at: fileURL)
                        cont.resume(throwing: failure)
                        return
                    }
                    cont.resume(returning: ExportedOriginal(
                        fileURL: fileURL,
                        filename: resource.originalFilename,
                        sha256: hasher.finalize().map { String(format: "%02x", $0) }.joined()
                    ))
                }
            )
        }
    }
}

struct ExportedOriginal {
    let fileURL: URL
    let filename: String
    let sha256: String
}
