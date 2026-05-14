# Whispic

Personal iOS app to back up photos and videos to a home server over WiFi, and browse what's already there.

## Overview

Whispic selectively backs up photos and videos from chosen albums to an external hard drive connected to a home server. All backup state lives on-device in a SQLite database — the server is completely stateless.

```
iPhone (iOS App)
    |  on-device SQLite  ← tracks backed-up asset IDs per album
    |  WiFi / HTTPS
    v
local-link-downloader  (dl.home.whispyy.xyz)
    |  POST /api/upload?folderKey=photos&subpath=YYYY/MM/DD
    |  GET  /api/browse/photos?recursive=true
    |  GET  /api/browse/photos/:filename?subpath=YYYY/MM/DD
    v
/media/srv-admin/TOSHIBA EXT/Photos/
    YYYY/MM/DD/
        IMG_0042.jpg
        VID_0043.mov
```

Authentication uses the existing `local-link-downloader` session token (`POST /api/auth`), stored in Keychain.

---

## Repository structure

```
whispic/
├── ios/
│   ├── whispic.xcodeproj/
│   └── whispic/
│       ├── App.swift
│       ├── Views/
│       │   ├── ContentView.swift          TabView root
│       │   ├── BackupView.swift           Progress + start button
│       │   ├── GalleryView.swift          Grid + full-screen viewer
│       │   ├── SettingsView.swift         Server URL, password, album selection
│       │   └── AlbumSelectionView.swift   Album list with toggles + date pickers
│       ├── Services/
│       │   ├── PhotoLibraryService.swift  PHPhotoLibrary wrapper
│       │   ├── BackupService.swift        Upload queue + progress
│       │   ├── APIClient.swift            URLSession HTTP client
│       │   ├── GalleryService.swift       Fetches gallery from server
│       │   └── BackupStore.swift          GRDB SQLite manifest
│       ├── Models/
│       │   ├── BackupConfig.swift         Server URL (UserDefaults) + token (Keychain)
│       │   ├── BackupSession.swift        Live progress state (@Observable)
│       │   ├── AlbumSelection.swift       Album + date range (UserDefaults)
│       │   └── GalleryGroup.swift         /api/browse response models
│       └── Resources/
│           └── Info.plist
└── README.md
```

---

## iOS app

**Requirements:** iOS 17+, Xcode 15+

**Dependencies (Swift Package Manager):**
- [GRDB.swift](https://github.com/groue/GRDB.swift) — on-device SQLite

### Tabs

| Tab | Purpose |
|-----|---------|
| Backup | Select albums, start/stop backup, live progress |
| Gallery | Browse photos already on the server |
| Settings | Configure server URL, authenticate, select albums |

### Backup flow

1. Request photo library access (`PHPhotoLibrary`)
2. For each enabled album, fetch assets filtered by the configured date range
3. Diff against the on-device SQLite manifest — only new assets are uploaded
4. Fetch original file data via `PHAssetResourceManager` (preserves EXIF)
5. `POST /api/upload` with `folderKey=photos`, `subpath=YYYY/MM/DD`, filename
6. On success, record the `localIdentifier` in SQLite — re-runs are idempotent

### Gallery

- Loads file list via `GET /api/browse/photos?recursive=true`
- Groups files by date, sorted newest first
- Thumbnails served via `GET /api/browse/photos/:filename?subpath=YYYY/MM/DD` with Bearer auth
- Responses cached in `URLCache` (50 MB memory / 500 MB disk)
- Pull to refresh

---

## Server

Whispic reuses the existing [local-link-downloader](https://github.com/whispyy/local-link-downloader) container with three minimal changes to `server/app.ts`:

1. **Removed depth cap** from `validateSubpath()` — allows `YYYY/MM/DD` (3 levels)
2. **Subpath support on upload** — `POST /api/upload` now accepts a `subpath` field to write files into nested folders
3. **Recursive browse** — `GET /api/browse/:folderKey?recursive=true` walks the full directory tree and returns a flat file list

No new files or routes were added.

### Ansible

The `photos` folder is mounted into the container by adding an entry to `linkdownloader_download_folders` in `inventories/home/group_vars/all/vars.yml`:

```yaml
- key: photos
  host_path: "{{ media_root }}/Photos"
  container_path: /photos
```

`media_root` is already defined as `/media/srv-admin/TOSHIBA EXT`.

---

## First-time setup

1. Deploy the updated `local-link-downloader` (run Ansible playbook)
2. Open the app → Settings tab
3. Enter the server URL (e.g. `https://dl.home.whispyy.xyz`) and password → Connect
4. Go to Albums → enable the albums you want to back up, optionally set date ranges
5. Backup tab → Start Backup

---

## Development

Open `ios/whispic.xcodeproj` in Xcode. No additional configuration needed — GRDB.swift is resolved automatically via SPM on first build.

To test the server endpoints manually:

```bash
# Authenticate
TOKEN=$(curl -s -X POST https://dl.home.whispyy.xyz/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"password":"<your-password>"}' | jq -r .token)

# Upload a file
curl -X POST https://dl.home.whispyy.xyz/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "folderKey=photos" \
  -F "subpath=2026/05/13" \
  -F "filenameOverride=test.jpg" \
  -F "file=@test.jpg"

# List all backed-up files
curl -H "Authorization: Bearer $TOKEN" \
  "https://dl.home.whispyy.xyz/api/browse/photos?recursive=true"

# Fetch a specific file
curl -H "Authorization: Bearer $TOKEN" \
  "https://dl.home.whispyy.xyz/api/browse/photos/test.jpg?subpath=2026/05/13" \
  -o out.jpg
```
