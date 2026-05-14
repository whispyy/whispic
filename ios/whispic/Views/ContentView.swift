import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            BackupView()
                .tabItem { Label("Backup", systemImage: "arrow.up.circle") }
            GalleryView()
                .tabItem { Label("Gallery", systemImage: "photo.on.rectangle") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}
