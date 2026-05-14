import SwiftUI

struct GalleryView: View {
    private let service = GalleryService.shared
    @State private var selectedFile: GalleryFile?

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
                                    }
                                }
                            }
                        }
                        .padding(.bottom, 8)
                    }
                    .refreshable { await service.refresh() }
                }
            }
            .navigationTitle("Gallery")
            .task { if service.groups.isEmpty { await service.refresh() } }
            .sheet(item: $selectedFile) { PhotoDetailView(file: $0) }
        }
    }
}

struct ThumbnailView: View {
    let file: GalleryFile

    var body: some View {
        if let req = try? APIClient.shared.photoRequest(for: file) {
            AuthenticatedAsyncImage(request: req)
                .scaledToFill()
                .frame(width: 100, height: 100)
                .clipped()
        } else {
            Color.secondary.opacity(0.2)
                .frame(width: 100, height: 100)
        }
    }
}

struct PhotoDetailView: View {
    let file: GalleryFile
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1

    var body: some View {
        NavigationStack {
            Group {
                if let req = try? APIClient.shared.photoRequest(for: file) {
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
            .navigationTitle(file.filename)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
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
            if let image {
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
