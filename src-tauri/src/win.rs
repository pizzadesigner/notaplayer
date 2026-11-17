// Windows: follows whatever Windows shows in its media panel (Spotify, browsers, Apple Music, ...)
// through the system media controls, and sets the volume of that app only.
use base64::Engine;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use windows::core::{Interface, PWSTR};
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use windows::Storage::Streams::{DataReader, IRandomAccessStreamReference};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
    ISimpleAudioVolume, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

// Every thread that talks to Windows media/audio needs this once; repeating it is harmless.
fn com() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

fn manager() -> Option<Manager> {
    com();
    Manager::RequestAsync().ok()?.join().ok()
}

// The player Windows currently shows in its media panel.
fn session() -> Option<Session> {
    manager()?.GetCurrentSession().ok()
}

pub fn now_playing() -> Option<super::Track> {
    let s = session()?;
    let status = s.GetPlaybackInfo().ok()?.PlaybackStatus().ok()?;
    if status == Status::Stopped || status == Status::Closed {
        return None;
    }
    let props = s.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
    let text = |h: windows::core::Result<windows::core::HSTRING>| h.map(|h| h.to_string()).unwrap_or_default();
    let (name, artist, album) = (text(props.Title()), text(props.Artist()), text(props.AlbumTitle()));
    Some(super::Track {
        playing: status == Status::Playing,
        id: format!("{name}\u{1f}{artist}\u{1f}{album}"), // Windows gives no track id
        artwork_url: props.Thumbnail().ok().and_then(|t| thumbnail(&t)).unwrap_or_default(),
        volume: volumes(&s).first().and_then(|v| unsafe { v.GetMasterVolume() }.ok()).map_or(100, |v| (v * 100.0).round() as u8),
        name,
        artist,
        album,
    })
}

// Cover picture as a data: URL, so the page loads it like Spotify's cover links.
fn thumbnail(t: &IRandomAccessStreamReference) -> Option<String> {
    let stream = t.OpenReadAsync().ok()?.join().ok()?;
    let size = stream.Size().ok()? as u32;
    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size).ok()?.join().ok()?;
    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes).ok()?;
    let kind = stream.ContentType().map(|h| h.to_string()).unwrap_or_default();
    let kind = if kind.is_empty() { "image/png".to_string() } else { kind };
    Some(format!("data:{kind};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

pub fn play_pause() {
    if let Some(s) = session() {
        let _ = s.TryTogglePlayPauseAsync().and_then(|a| a.join());
    }
}

// Back always goes to the previous song: rewinding to 0 first stops players from just restarting this one.
pub fn skip(forward: bool) {
    let Some(s) = session() else { return };
    if forward {
        let _ = s.TrySkipNextAsync().and_then(|a| a.join());
    } else {
        let _ = s.TryChangePlaybackPositionAsync(0).and_then(|a| a.join());
        let _ = s.TrySkipPreviousAsync().and_then(|a| a.join());
    }
}

pub fn set_volume(volume: u8) {
    let Some(s) = session() else { return };
    for v in volumes(&s) {
        let _ = unsafe { v.SetMasterVolume(volume.min(100) as f32 / 100.0, std::ptr::null()) };
    }
}

// Volume controls of the playing app's audio (a browser can have several).
fn volumes(s: &Session) -> Vec<ISimpleAudioVolume> {
    let player = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
    com();
    unsafe {
        let Ok(devices) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else { return vec![] };
        let Ok(device) = devices.GetDefaultAudioEndpoint(eRender, eConsole) else { return vec![] };
        let Ok(sessions) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { return vec![] };
        let Ok(list) = sessions.GetSessionEnumerator() else { return vec![] };
        (0..list.GetCount().unwrap_or(0))
            .filter_map(|i| {
                let ctl: IAudioSessionControl2 = list.GetSession(i).ok()?.cast().ok()?;
                let exe = exe_name(ctl.GetProcessId().ok()?)?;
                super::same_app(&player, &exe).then(|| ctl.cast::<ISimpleAudioVolume>().ok()).flatten()
            })
            .collect()
    }
}

fn exe_name(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(h);
        ok.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

// Re-read and send the track whenever the player, its song or its play state changes.
pub fn listen(app: AppHandle) {
    std::thread::spawn(move || {
        let Some(m) = manager() else { return };
        let emit: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
            let app = app.clone();
            std::thread::spawn(move || {
                let _ = app.emit("track", now_playing());
            });
        });
        let watch = {
            let emit = emit.clone();
            move |s: &Session| {
                let e = emit.clone();
                let _ = s.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
                    e();
                    Ok(())
                }));
                let e = emit.clone();
                let _ = s.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
                    e();
                    Ok(())
                }));
            }
        };
        if let Ok(s) = m.GetCurrentSession() {
            watch(&s);
        }
        let _ = m.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
            if let Some(s) = session() {
                watch(&s);
            }
            emit();
            Ok(())
        }));
        loop {
            std::thread::park(); // keeps the manager and its handlers alive
        }
    });
}
