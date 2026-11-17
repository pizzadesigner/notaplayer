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

// Spotify output: one field per line, empty when Spotify is closed or stopped.
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
    mac::now_playing()
}

#[tauri::command]
async fn set_volume(volume: u8) {
    mac::set_volume(volume)
}

#[tauri::command]
async fn play_pause() {
    mac::play_pause()
}

#[tauri::command]
async fn skip(forward: bool) {
    mac::skip(forward)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            mac::listen(app.handle().clone());
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
        .invoke_handler(tauri::generate_handler![current_track, set_volume, play_pause, skip])
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
}
