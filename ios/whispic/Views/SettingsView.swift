import SwiftUI

struct SettingsView: View {
    private let config = BackupConfig.shared
    @State private var password = ""
    @State private var isConnecting = false
    @State private var connectError: String?
    @State private var connectSuccess = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("URL (https://…)", text: Binding(
                        get: { config.serverURL },
                        set: { config.serverURL = $0 }
                    ))
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)

                    SecureField("Password", text: $password)

                    Button {
                        Task { await connect() }
                    } label: {
                        HStack {
                            Text("Connect")
                            Spacer()
                            if isConnecting { ProgressView() }
                        }
                    }
                    .disabled(config.serverURL.isEmpty || password.isEmpty || isConnecting)

                    if connectSuccess {
                        Label("Connected", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                    if let err = connectError {
                        Text(err).font(.caption).foregroundStyle(.red)
                    }
                }

                Section("Albums") {
                    NavigationLink("Select Albums") { AlbumSelectionView() }
                }

                if config.hasToken {
                    Section {
                        Button("Sign Out", role: .destructive) {
                            config.sessionToken = nil
                            connectSuccess = false
                        }
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }

    private func connect() async {
        isConnecting = true
        connectError = nil
        connectSuccess = false
        do {
            try await APIClient.shared.authenticate(password: password)
            connectSuccess = true
            password = ""
        } catch {
            connectError = error.localizedDescription
        }
        isConnecting = false
    }
}
