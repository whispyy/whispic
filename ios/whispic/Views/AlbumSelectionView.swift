import SwiftUI
import Photos

struct AlbumSelectionView: View {
    @State private var selections: [AlbumSelection] = UserDefaults.standard.loadAlbumSelections()
    @State private var authStatus: PHAuthorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)

    var body: some View {
        List {
            switch authStatus {
            case .authorized, .limited:
                ForEach($selections) { $sel in AlbumRowView(selection: $sel) }
            case .denied, .restricted:
                Text("Photo access denied. Enable it in Settings → Privacy → Photos.")
                    .foregroundStyle(.secondary)
            default:
                Button("Allow Photo Access") {
                    Task { await requestAccess() }
                }
            }
        }
        .navigationTitle("Albums")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAlbums() }
        .onChange(of: selections) { _, new in UserDefaults.standard.saveAlbumSelections(new) }
    }

    private func requestAccess() async {
        authStatus = await PhotoLibraryService.shared.requestAuthorization()
        if authStatus == .authorized || authStatus == .limited { await loadAlbums() }
    }

    private func loadAlbums() async {
        authStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard authStatus == .authorized || authStatus == .limited else { return }

        let albums = PhotoLibraryService.shared.fetchAllAlbums()
        let existing = Dictionary(uniqueKeysWithValues: selections.map { ($0.albumId, $0) })
        selections = albums.map { album in
            if let prev = existing[album.id] {
                return AlbumSelection(
                    albumId: prev.albumId, albumName: album.name,
                    enabled: prev.enabled, fromDate: prev.fromDate, toDate: prev.toDate
                )
            }
            return AlbumSelection(albumId: album.id, albumName: album.name, enabled: false)
        }
    }
}

struct AlbumRowView: View {
    @Binding var selection: AlbumSelection
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Toggle(isOn: $selection.enabled) {
                    Text(selection.albumName)
                }
                if selection.enabled {
                    Button {
                        withAnimation { expanded.toggle() }
                    } label: {
                        Image(systemName: expanded ? "chevron.up" : "chevron.down")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 4)

            if expanded && selection.enabled {
                VStack(alignment: .leading, spacing: 10) {
                    Toggle("From date", isOn: Binding(
                        get: { selection.fromDate != nil },
                        set: { selection.fromDate = $0
                            ? Calendar.current.date(byAdding: .year, value: -1, to: Date())
                            : nil }
                    ))
                    if selection.fromDate != nil {
                        DatePicker("From", selection: Binding(
                            get: { selection.fromDate ?? Date() },
                            set: { selection.fromDate = $0 }
                        ), displayedComponents: .date)
                        .labelsHidden()
                    }

                    Toggle("To date", isOn: Binding(
                        get: { selection.toDate != nil },
                        set: { selection.toDate = $0 ? Date() : nil }
                    ))
                    if selection.toDate != nil {
                        DatePicker("To", selection: Binding(
                            get: { selection.toDate ?? Date() },
                            set: { selection.toDate = $0 }
                        ), displayedComponents: .date)
                        .labelsHidden()
                    }
                }
                .padding(.leading, 4)
                .padding(.bottom, 8)
            }
        }
    }
}
