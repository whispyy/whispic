import SwiftUI

struct GalleryView: View {
    private let service = GalleryService.shared
    @State private var selectedFile: AssetSummary?
    @State private var query = ""

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 2)]

    var body: some View {
        NavigationStack {
            Group {
                if service.isLoading && service.groups.isEmpty {
                    ProgressView("Loading gallery…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = service.error, service.groups.isEmpty {
                    ContentUnavailableView(
                        "Failed to load",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                } else if service.groups.isEmpty {
                    ContentUnavailableView(
                        "No Photos",
                        systemImage: "photo.on.rectangle",
                        description: Text("Back up some photos first")
                    )
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(service.groups) { group in
                                Text(group.displayDate)
                                    .font(.headline)
                                    .padding(.horizontal, 12)
                                    .padding(.top, 12)
                                    .padding(.bottom, 4)
                                LazyVGrid(columns: columns, spacing: 2) {
                                    ForEach(group.files) { file in
                                        ThumbnailView(file: file)
                                            .onTapGesture { selectedFile = file }
                                            .onAppear {
                                                if group.id == service.groups.last?.id,
                                                   file.id == group.files.last?.id {
                                                    Task { await service.loadMore() }
                                                }
                                            }
                                    }
                                }
                            }
                            if service.isLoadingMore {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                                    .padding()
                            }
                        }
                        .padding(.bottom, 8)
                    }
                    .refreshable { await service.refresh() }
                }
            }
            .navigationTitle("Gallery")
            .searchable(text: $query, prompt: "Search photos, camera, place…")
            .onSubmit(of: .search) { Task { await runSearch() } }
            .onChange(of: query) { _, newValue in
                if newValue.isEmpty { Task { await service.refresh() } }
            }
            .task { if service.groups.isEmpty { await service.refresh() } }
            .sheet(item: $selectedFile) { file in
                PhotoDetailView(
                    file: file,
                    onFavoriteChange: { id, favorite in service.setFavorite(id, favorite: favorite) },
                    onTrashed: { id in service.removeAsset(id) }
                )
            }
        }
    }

    private func runSearch() async {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            await service.refresh()
            return
        }
        await service.search(query: trimmed)
    }
}

struct ThumbnailView: View {
    let file: AssetSummary

    var body: some View {
        ZStack {
            if file.hasThumb, let req = try? APIClient.shared.assetRequest(id: file.id, kind: .thumb) {
                AuthenticatedAsyncImage(request: req)
                    .scaledToFill()
                    .frame(width: 100, height: 100)
                    .clipped()
            } else {
                Color.secondary.opacity(0.15)
                    .frame(width: 100, height: 100)
            }
            if file.isVideo {
                Image(systemName: "play.fill")
                    .foregroundStyle(.white)
                    .shadow(radius: 2)
            }
        }
    }
}

struct PhotoDetailView: View {
    let file: AssetSummary
    var onFavoriteChange: ((String, Bool) -> Void)?
    var onTrashed: ((String) -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var favorite: Bool
    @State private var isBusy = false
    @State private var showAlbumPicker = false

    init(
        file: AssetSummary,
        onFavoriteChange: ((String, Bool) -> Void)? = nil,
        onTrashed: ((String) -> Void)? = nil
    ) {
        self.file = file
        self.onFavoriteChange = onFavoriteChange
        self.onTrashed = onTrashed
        _favorite = State(initialValue: file.favorite)
    }

    var body: some View {
        NavigationStack {
            Group {
                if let req = try? APIClient.shared.assetRequest(id: file.id, kind: .preview) {
                    AuthenticatedAsyncImage(request: req)
                        .scaledToFit()
                        .scaleEffect(scale)
                        .gesture(
                            MagnificationGesture()
                                .onChanged { scale = max(1, $0) }
                                .onEnded { _ in withAnimation { if scale < 1 { scale = 1 } } }
                        )
                } else {
                    ContentUnavailableView("Cannot load", systemImage: "photo")
                }
            }
            .navigationTitle(file.takenAtDisplay)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 20) {
                        Button {
                            Task { await toggleFavorite() }
                        } label: {
                            Image(systemName: favorite ? "star.fill" : "star")
                        }
                        .disabled(isBusy)

                        Button {
                            showAlbumPicker = true
                        } label: {
                            Image(systemName: "plus.rectangle.on.folder")
                        }

                        Button(role: .destructive) {
                            Task { await trash() }
                        } label: {
                            Image(systemName: "trash")
                        }
                        .disabled(isBusy)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showAlbumPicker) {
                AlbumPickerView(assetId: file.id)
            }
        }
    }

    private func toggleFavorite() async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            let next = try await APIClient.shared.toggleFavorite(id: file.id)
            favorite = next
            onFavoriteChange?(file.id, next)
        } catch {
            // leave state as-is
        }
    }

    private func trash() async {
        guard !isBusy else { return }
        isBusy = true
        do {
            try await APIClient.shared.trashAsset(id: file.id)
            onTrashed?(file.id)
            dismiss()
        } catch {
            isBusy = false
        }
    }
}

/// Sheet for adding the current asset to an existing (or newly created) album.
struct AlbumPickerView: View {
    let assetId: String
    @Environment(\.dismiss) private var dismiss
    @State private var albums: [Album] = []
    @State private var isLoading = true
    @State private var newName = ""
    @State private var addedId: String?
    @State private var isBusy = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if albums.isEmpty {
                    ContentUnavailableView("No Albums", systemImage: "rectangle.stack")
                } else {
                    List(albums) { album in
                        Button {
                            Task { await add(album.id) }
                        } label: {
                            HStack {
                                Text(album.name)
                                Spacer()
                                if addedId == album.id {
                                    Image(systemName: "checkmark").foregroundStyle(.green)
                                }
                            }
                        }
                        .disabled(isBusy)
                    }
                }
            }
            .navigationTitle("Add to Album")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                HStack {
                    TextField("New album name", text: $newName)
                        .textFieldStyle(.roundedBorder)
                    Button("Create") { Task { await create() } }
                        .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || isBusy)
                }
                .padding()
                .background(.bar)
            }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        do { albums = try await APIClient.shared.fetchAlbums() } catch { }
        isLoading = false
    }

    private func add(_ albumId: String) async {
        guard !isBusy else { return }
        isBusy = true
        do {
            try await APIClient.shared.addAsset(assetId, toAlbum: albumId)
            addedId = albumId
        } catch { }
        isBusy = false
    }

    private func create() async {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !isBusy else { return }
        isBusy = true
        do {
            let album = try await APIClient.shared.createAlbum(name: name)
            try await APIClient.shared.addAsset(assetId, toAlbum: album.id)
            albums.insert(album, at: 0)
            addedId = album.id
            newName = ""
        } catch { }
        isBusy = false
    }
}

/// URLSession-backed async image that sends a Bearer Authorization header.
/// Caches responses in URLCache.shared for fast re-display.
struct AuthenticatedAsyncImage: View {
    let request: URLRequest
    @State private var image: UIImage?
    @State private var isLoading = true

    var body: some View {
        Group {
            if let image = image {
                Image(uiImage: image).resizable()
            } else if isLoading {
                Color.secondary.opacity(0.2).overlay { ProgressView() }
            } else {
                Color.secondary.opacity(0.2)
                    .overlay { Image(systemName: "photo").foregroundStyle(.secondary) }
            }
        }
        .task(id: request.url?.absoluteString) { await load() }
    }

    private func load() async {
        isLoading = true
        if let cached = URLCache.shared.cachedResponse(for: request) {
            image = UIImage(data: cached.data)
            isLoading = false
            return
        }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                URLCache.shared.storeCachedResponse(
                    CachedURLResponse(response: response, data: data),
                    for: request
                )
                image = UIImage(data: data)
            }
        } catch { }
        isLoading = false
    }
}
