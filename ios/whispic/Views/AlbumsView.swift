import SwiftUI

struct AlbumsView: View {
    @State private var albums: [Album] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showCreate = false
    @State private var newName = ""

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && albums.isEmpty {
                    ProgressView("Loading albums…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error, albums.isEmpty {
                    ContentUnavailableView(
                        "Failed to load",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                } else if albums.isEmpty {
                    ContentUnavailableView(
                        "No Albums",
                        systemImage: "rectangle.stack",
                        description: Text("Tap + to create your first album")
                    )
                } else {
                    List(albums) { album in
                        NavigationLink {
                            AlbumDetailView(albumId: album.id, onChanged: { Task { await load() } })
                        } label: {
                            HStack {
                                Text(album.name)
                                Spacer()
                                Text("\(album.assetCount)")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Albums")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                }
            }
            .alert("New Album", isPresented: $showCreate) {
                TextField("Name", text: $newName)
                Button("Create") { Task { await create() } }
                Button("Cancel", role: .cancel) { newName = "" }
            }
            .task { if albums.isEmpty { await load() } }
            .refreshable { await load() }
        }
    }

    private func load() async {
        isLoading = true
        error = nil
        do {
            albums = try await APIClient.shared.fetchAlbums()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func create() async {
        let name = newName.trimmingCharacters(in: .whitespaces)
        newName = ""
        guard !name.isEmpty else { return }
        do {
            let album = try await APIClient.shared.createAlbum(name: name)
            albums.insert(album, at: 0)
        } catch {
            // ignore
        }
    }
}

struct AlbumDetailView: View {
    let albumId: String
    var onChanged: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var album: Album?
    @State private var items: [AssetSummary] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var selectedFile: AssetSummary?
    @State private var showRename = false
    @State private var renameText = ""

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 2)]

    var body: some View {
        Group {
            if isLoading && items.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error, items.isEmpty {
                ContentUnavailableView(
                    "Failed to load",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
            } else if items.isEmpty {
                ContentUnavailableView("No Photos", systemImage: "photo.on.rectangle")
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 2) {
                        ForEach(items) { file in
                            ThumbnailView(file: file)
                                .onTapGesture { selectedFile = file }
                                .overlay(alignment: .topTrailing) {
                                    Button {
                                        Task { await remove(file.id) }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundStyle(.white, .black.opacity(0.6))
                                            .padding(4)
                                    }
                                }
                        }
                    }
                }
            }
        }
        .navigationTitle(album?.name ?? "Album")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Rename") {
                        renameText = album?.name ?? ""
                        showRename = true
                    }
                    Button("Delete", role: .destructive) { Task { await deleteAlbum() } }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .alert("Rename Album", isPresented: $showRename) {
            TextField("Name", text: $renameText)
            Button("Save") { Task { await rename() } }
            Button("Cancel", role: .cancel) { }
        }
        .task { await load() }
        .sheet(item: $selectedFile) { file in
            PhotoDetailView(
                file: file,
                onFavoriteChange: { id, favorite in
                    guard let idx = items.firstIndex(where: { $0.id == id }) else { return }
                    let f = items[idx]
                    items[idx] = AssetSummary(
                        id: f.id, takenAt: f.takenAt, type: f.type, width: f.width, height: f.height,
                        durationS: f.durationS, favorite: favorite, hasThumb: f.hasThumb
                    )
                },
                onTrashed: { id in items.removeAll { $0.id == id } }
            )
        }
    }

    private func load() async {
        isLoading = true
        error = nil
        do {
            let result = try await APIClient.shared.fetchAlbum(id: albumId)
            album = result.album
            items = result.items
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func remove(_ assetId: String) async {
        do {
            try await APIClient.shared.removeAsset(assetId, fromAlbum: albumId)
            items.removeAll { $0.id == assetId }
        } catch {
            // ignore
        }
    }

    private func rename() async {
        let name = renameText.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        do {
            album = try await APIClient.shared.renameAlbum(id: albumId, name: name)
            onChanged?()
        } catch {
            // ignore
        }
    }

    private func deleteAlbum() async {
        do {
            try await APIClient.shared.deleteAlbum(id: albumId)
            onChanged?()
            dismiss()
        } catch {
            // ignore
        }
    }
}
