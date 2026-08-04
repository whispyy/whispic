import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            BackupView()
                .tabItem { Label("Backup", systemImage: "arrow.up.circle") }
            GalleryView()
                .tabItem { Label("Gallery", systemImage: "photo.on.rectangle") }
            AlbumsView()
                .tabItem { Label("Albums", systemImage: "rectangle.stack") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}
