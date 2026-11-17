# notaplayer

A small pixel-art record player for your desktop. It shows the music you are playing as a vinyl on a turntable, with the album cover on the record and the sleeve standing behind it.

## What it does

- **Follows your music**
  - macOS: Spotify.
  - Windows: anything in the Windows media panel (Spotify, browsers such as YouTube in Chrome or Edge, Apple Music, VLC and more).
- **Spinning record**: turns at 33⅓ RPM while playing and slows to a stop on pause. While paused, the tonearm lifts and hovers above the record.
- **Album changes**: the record goes back into its sleeve, the sleeve slides into the stand on the right, and the new album slides out with its record. The wall takes on the color of the new cover.
- **Album stand**: the last 3 albums you played peek in from the right edge.
- **Controls on the player**
  - Start/stop button (front left): play / pause.
  - Click the album on the wall: next song.
  - Click the stand: previous song.
  - Volume slider (right side), or scroll anywhere on the scene: volume of the music app only, not the whole computer.
- **Three looks**: double-click an empty spot to cycle between them, or pick one from the menu bar / tray icon.
  - **Window**: the full scene in a normal window.
  - **Scene widget**: the full scene, small, with rounded corners, sitting on the desktop.
  - **Record widget**: just the spinning record. On an album change it flips like a coin.

  Widgets sit behind your other windows and can be dragged from any empty spot.

## Install

Download the file for your system from the [Releases](../../releases) page.

### macOS (Apple Silicon)

1. Open `notaplayer_<version>_aarch64.dmg` and drag **notaplayer** into **Applications**.
2. The app is not signed with an Apple developer account, so the first launch is blocked ("Apple could not verify…"). Click **Done**, then open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to notaplayer. You only have to do this once.

   If macOS says notaplayer "is damaged" instead (version 0.0.0), run this once in Terminal and open it again:

   ```bash
   xattr -cr /Applications/notaplayer.app
   ```
3. When asked, allow notaplayer to control **Spotify**. If you clicked "Don't Allow", turn it on under **System Settings → Privacy & Security → Automation → notaplayer → Spotify**.

Intel Macs are not supported yet.

### Windows

1. Run `notaplayer_<version>_x64-setup.exe`.
2. The installer is not signed, so Windows may show "Windows protected your PC": click **More info** → **Run anyway**.
3. Start notaplayer from the Start menu and play some music.

Note: in Firefox the volume slider has no effect (Firefox doesn't tell Windows which program it is). Everything else works.

## Building it yourself

Needs [Rust](https://rustup.rs) and [Node.js](https://nodejs.org).

```bash
npm install
npm run tauri dev     # run while developing
npm run tauri build   # build the installer for your system
```

Pushing a tag like `v0.0.1` makes GitHub build the Windows `.exe` and the Mac `.dmg` and attach them to a release.

To change the app icon, replace `app-icon-macos.png` (1024×1024, in the macOS rounded-square shape) and run `npm run tauri icon app-icon-macos.png`.
