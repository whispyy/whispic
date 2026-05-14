import SwiftUI

@main
struct WhispicApp: App {
    init() {
        URLCache.shared = URLCache(
            memoryCapacity: 50 * 1024 * 1024,
            diskCapacity: 500 * 1024 * 1024,
            diskPath: "whispic_image_cache"
        )
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
