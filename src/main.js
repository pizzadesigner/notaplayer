const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const out = document.getElementById("out");

// Temporary text view until the turntable is drawn (step 3).
function show(t) {
  console.log(t);
  out.textContent = t
    ? `${t.playing ? "▶ playing" : "⏸ paused"}\n${t.name}\n${t.artist}\n${t.album}\n${t.artwork_url}`
    : "Spotify is closed or stopped";
}

listen("track", (e) => show(e.payload));
invoke("current_track").then(show);
