use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Track {
    playing: bool,
    id: String,
    name: String,
    artist: String,
    album: String,
    artwork_url: String,
    volume: u8, // Spotify's own volume, 0..100
}

// Mac reads Spotify, Windows reads whatever plays (see win.rs). Both offer the same functions.
#[cfg(target_os = "macos")]
use mac as player;
#[cfg(windows)]
mod win;
#[cfg(windows)]
use win as player;

// Windows: does an audio program (its .exe path) belong to the player Windows reports
// ("Spotify.exe", "Chrome", "SpotifyAB.SpotifyMusic_...!Spotify")?
#[cfg_attr(not(windows), allow(dead_code))]
fn same_app(player: &str, exe_path: &str) -> bool {
    let exe = exe_path.rsplit(['\\', '/']).next().unwrap_or("").to_lowercase();
    let exe = exe.trim_end_matches(".exe");
    !exe.is_empty() && player.to_lowercase().contains(exe)
}

// Spotify output: one field per line, empty when Spotify is closed or stopped.
#[cfg_attr(windows, allow(dead_code))]
fn parse(out: &str) -> Option<Track> {
    let f: Vec<&str> = out.trim_end_matches('\n').split('\n').collect();
    let [state, id, name, artist, album, art, volume] = f[..] else { return None };
    Some(Track {
        playing: state == "playing",
        id: id.into(),
        name: name.into(),
        artist: artist.into(),
        album: album.into(),
        artwork_url: art.into(),
        volume: volume.trim().parse().unwrap_or(100),
    })
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::rc::Retained;
    use objc2::runtime::NSObject;
    use objc2::{define_class, msg_send, sel, AllocAnyThread, DefinedClass};
    use objc2_foundation::{
        NSDistributedNotificationCenter, NSNotification, NSNotificationSuspensionBehavior,
        NSObjectProtocol, NSString,
    };
    use tauri::{AppHandle, Emitter};

    const SCRIPT: &str = r#"
if application "Spotify" is running then
  tell application "Spotify"
    if player state is stopped then return ""
    set t to current track
    return (player state as string) & linefeed & (id of t) & linefeed & (name of t) & linefeed & (artist of t) & linefeed & (album of t) & linefeed & (artwork url of t) & linefeed & (sound volume as string)
  end tell
end if
return """#;

    pub fn now_playing() -> Option<super::Track> {
        let out = std::process::Command::new("osascript").args(["-e", SCRIPT]).output().ok()?;
        if !out.status.success() {
            eprintln!("spotify: {}", String::from_utf8_lossy(&out.stderr));
        }
        super::parse(&String::from_utf8_lossy(&out.stdout))
    }

    pub fn set_volume(volume: u8) {
        let script = format!(r#"if application "Spotify" is running then tell application "Spotify" to set sound volume to {}"#, volume.min(100));
        let _ = std::process::Command::new("osascript").args(["-e", &script]).output();
    }

    pub fn play_pause() {
        let script = r#"if application "Spotify" is running then tell application "Spotify" to playpause"#;
        let _ = std::process::Command::new("osascript").args(["-e", script]).output();
    }

    // Back always goes to the previous song: rewinding to 0 first stops Spotify from just restarting this one.
    pub fn skip(forward: bool) {
        let action = if forward { "next track" } else { "set player position to 0\n    previous track" };
        let script = format!("if application \"Spotify\" is running then\n  tell application \"Spotify\"\n    {action}\n  end tell\nend if");
        let _ = std::process::Command::new("osascript").args(["-e", &script]).output();
    }

    // Jump by `seconds` (negative = back), kept inside the song.
    pub fn seek_by(seconds: f64) {
        let script = format!(
            "if application \"Spotify\" is running then\n  tell application \"Spotify\"\n    set p to (player position) + ({seconds})\n    set d to (duration of current track) / 1000\n    if p > d - 1 then set p to d - 1\n    if p < 0 then set p to 0\n    set player position to p\n  end tell\nend if"
        );
        let _ = std::process::Command::new("osascript").args(["-e", &script]).output();
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "VinylSpotifyObserver"]
        #[ivars = AppHandle]
        struct Observer;

        unsafe impl NSObjectProtocol for Observer {}

        impl Observer {
            #[unsafe(method(changed:))]
            fn changed(&self, _n: &NSNotification) {
                let app = self.ivars().clone();
                // osascript takes ~100ms, keep it off the UI thread.
                std::thread::spawn(move || {
                    let _ = app.emit("track", now_playing());
                });
            }
        }
    );

    // Spotify announces every play/pause/track change under this name.
    pub fn listen(app: AppHandle) {
        let this = Observer::alloc().set_ivars(app);
        let observer: Retained<Observer> = unsafe { msg_send![super(this), init] };
        unsafe {
            NSDistributedNotificationCenter::defaultCenter()
                .addObserver_selector_name_object_suspensionBehavior(
                    &observer,
                    sel!(changed:),
                    Some(&NSString::from_str("com.spotify.client.PlaybackStateChanged")),
                    None,
                    // Default would hold events while our window isn't focused.
                    NSNotificationSuspensionBehavior::DeliverImmediately,
                );
        }
        std::mem::forget(observer); // lives as long as the app
    }
}

#[tauri::command]
async fn current_track() -> Option<Track> {
    player::now_playing()
}

#[tauri::command]
async fn set_volume(volume: u8) {
    player::set_volume(volume)
}

#[tauri::command]
async fn play_pause() {
    player::play_pause()
}

#[tauri::command]
async fn skip(forward: bool) {
    player::skip(forward)
}

#[tauri::command]
async fn seek_by(seconds: f64) {
    if seconds.is_finite() {
        player::seek_by(seconds)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            player::listen(app.handle().clone());
            // Menu bar icon: switch modes (the page does the switching) or quit.
            use tauri::menu::{Menu, MenuItem};
            use tauri::Emitter;
            let window = MenuItem::with_id(app, "window", "Window", true, None::<&str>)?;
            let scene = MenuItem::with_id(app, "scene", "Scene widget", true, None::<&str>)?;
            let record = MenuItem::with_id(app, "record", "Record widget", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit notaplayer", true, None::<&str>)?;
            tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&Menu::with_items(app, &[&window, &scene, &record, &quit])?)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "quit" => app.exit(0),
                    mode => {
                        let _ = app.emit("mode", mode);
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![current_track, set_volume, play_pause, skip, seek_by])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_spotify_output() {
        let t = parse("paused\nspotify:track:1\nAirbag\nRadiohead\nOK Computer\nhttps://i.scdn.co/x\n42\n").unwrap();
        assert!(!t.playing);
        assert_eq!(t.volume, 42);
        assert_eq!((t.name.as_str(), t.album.as_str()), ("Airbag", "OK Computer"));
        assert_eq!(parse(""), None);
        assert_eq!(parse("\n"), None);
    }

    #[test]
    fn matches_player_to_its_program() {
        assert!(same_app("Spotify.exe", r"C:\Users\a\AppData\Roaming\Spotify\Spotify.exe"));
        assert!(same_app("Chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe"));
        assert!(same_app("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", r"C:\Program Files\WindowsApps\Spotify.exe"));
        assert!(!same_app("Chrome", r"C:\Windows\explorer.exe"));
        assert!(!same_app("Chrome", ""));
    }
}
