import SwiftUI

struct TrashView: View {
    @State private var items: [AssetSummary] = []
    @State private var isLoading = true
    @State private var error: String?

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 2)]

    var body: some View {
        Group {
            if isLoading && items.isEmpty {
                ProgressView("Loading trash…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error, items.isEmpty {
                ContentUnavailableView(
                    "Failed to load",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
            } else if items.isEmpty {
                ContentUnavailableView("Trash is Empty", systemImage: "trash")
            } else {
                ScrollView {
                    Text("Items are permanently deleted 30 days after being trashed.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.top, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    LazyVGrid(columns: columns, spacing: 2) {
                        ForEach(items) { file in
                            ZStack(alignment: .bottom) {
                                ThumbnailView(file: file)
                                Button {
                                    Task { await restore(file.id) }
                                } label: {
                                    Text("Restore")
                                        .font(.caption.bold())
                                        .foregroundStyle(.white)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 4)
                                        .background(.black.opacity(0.6))
                                }
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            }
        }
        .navigationTitle("Trash")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        error = nil
        do {
            items = try await APIClient.shared.fetchTrash()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func restore(_ id: String) async {
        do {
            try await APIClient.shared.restoreAsset(id: id)
            items.removeAll { $0.id == id }
        } catch {
            // ignore
        }
    }
}
