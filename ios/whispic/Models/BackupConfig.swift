import Foundation
import Observation
import Security

@Observable
final class BackupConfig {
    static let shared = BackupConfig()

    var serverURL: String {
        didSet { UserDefaults.standard.set(serverURL, forKey: "serverURL") }
    }

    /// Tracks whether a session token exists so SwiftUI can observe it.
    private(set) var hasToken: Bool

    var sessionToken: String? {
        get { KeychainHelper.read(key: "whispic.sessionToken") }
        set {
            if let value = newValue {
                KeychainHelper.write(key: "whispic.sessionToken", value: value)
            } else {
                KeychainHelper.delete(key: "whispic.sessionToken")
            }
            hasToken = newValue != nil
        }
    }

    private init() {
        serverURL = UserDefaults.standard.string(forKey: "serverURL") ?? ""
        hasToken = KeychainHelper.read(key: "whispic.sessionToken") != nil
    }
}

enum KeychainHelper {
    static func read(key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        delete(key: key)
        let attrs: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: key,
            kSecValueData: data,
        ]
        SecItemAdd(attrs as CFDictionary, nil)
    }

    static func delete(key: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
