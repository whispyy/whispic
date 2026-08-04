import Foundation
import GRDB

struct BackedUpAsset: Codable, FetchableRecord, PersistableRecord {
    let assetId: String
    let filename: String
    let albumId: String
    let sha256: String
    let serverAssetId: String
    let backedUpAt: Date

    static let databaseTableName = "backed_up_assets_v2"
}

final class BackupStore {
    static let shared = BackupStore()
    private let db: DatabasePool

    private init() {
        var url = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("whispic.sqlite")

        var rv = URLResourceValues()
        rv.isExcludedFromBackup = true
        try? url.setResourceValues(rv)

        db = try! DatabasePool(path: url.path)
        try! migrate()
    }

    private func migrate() throws {
        try db.write { d in
            // Fresh-start migration: the v1 table assumed per-device dedup by
            // PHAsset.localIdentifier only. It's no longer relevant now that the
            // server dedups by content hash across devices.
            if try d.tableExists("backed_up_assets") {
                try d.drop(table: "backed_up_assets")
            }

            try d.create(table: "backed_up_assets_v2", ifNotExists: true) { t in
                t.column("assetId",       .text).primaryKey()
                t.column("filename",      .text).notNull()
                t.column("albumId",       .text).notNull()
                t.column("sha256",        .text).notNull()
                t.column("serverAssetId", .text).notNull()
                t.column("backedUpAt",    .datetime).notNull()
            }
            try d.create(
                index: "idx_backed_up_v2_albumId",
                on: "backed_up_assets_v2",
                columns: ["albumId"],
                ifNotExists: true
            )
        }
    }

    func backedUpIds(inAlbum albumId: String) throws -> Set<String> {
        try db.read { d in
            Set(try String.fetchAll(
                d,
                sql: "SELECT assetId FROM backed_up_assets_v2 WHERE albumId = ?",
                arguments: [albumId]
            ))
        }
    }

    func markBackedUp(_ asset: BackedUpAsset) throws {
        try db.write { d in try asset.save(d) }
    }
}
