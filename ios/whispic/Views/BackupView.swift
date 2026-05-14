import SwiftUI

struct BackupView: View {
    @State private var albumSelections: [AlbumSelection] = []
    private let session = BackupSession.shared
    private let service = BackupService.shared

    var enabledCount: Int { albumSelections.filter(\.enabled).count }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if session.isRunning {
                    progressSection
                } else {
                    idleSection
                }
            }
            .padding(24)
            .navigationTitle("Backup")
            .onAppear { albumSelections = UserDefaults.standard.loadAlbumSelections() }
        }
    }

    private var idleSection: some View {
        VStack(spacing: 20) {
            Image(systemName: "arrow.up.circle")
                .font(.system(size: 64))
                .foregroundStyle(.blue)

            Text("\(enabledCount) album\(enabledCount == 1 ? "" : "s") selected")
                .font(.headline)
                .foregroundStyle(enabledCount == 0 ? .secondary : .primary)

            if session.total > 0 {
                HStack(spacing: 16) {
                    Label("\(session.uploaded) uploaded", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    if session.failed > 0 {
                        Label("\(session.failed) failed", systemImage: "xmark.circle.fill")
                            .foregroundStyle(.red)
                    }
                }
                .font(.subheadline)
            }

            if let err = session.lastError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button("Start Backup") {
                Task { await service.startBackup(albumSelections: albumSelections) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(enabledCount == 0)
        }
    }

    private var progressSection: some View {
        VStack(spacing: 16) {
            ProgressView(value: session.progress)
                .progressViewStyle(.linear)

            Text("\(session.uploaded + session.failed) / \(session.total)")
                .font(.title2.monospacedDigit())

            if !session.currentFilename.isEmpty {
                Text(session.currentFilename)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            HStack(spacing: 24) {
                Label("\(session.uploaded)", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                if session.failed > 0 {
                    Label("\(session.failed)", systemImage: "xmark.circle.fill")
                        .foregroundStyle(.red)
                }
            }
            .font(.headline)

            Button("Stop") { session.finish() }
                .buttonStyle(.bordered)
        }
    }
}
