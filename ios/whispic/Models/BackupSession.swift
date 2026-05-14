import Foundation
import Observation

@Observable
final class BackupSession {
    static let shared = BackupSession()

    var isRunning = false
    var total = 0
    var uploaded = 0
    var failed = 0
    var currentFilename = ""
    var lastError: String?

    var progress: Double {
        total > 0 ? Double(uploaded + failed) / Double(total) : 0
    }

    private init() {}

    func reset(total: Int) {
        self.total = total
        uploaded = 0
        failed = 0
        currentFilename = ""
        lastError = nil
        isRunning = true
    }

    func finish() {
        isRunning = false
    }
}
