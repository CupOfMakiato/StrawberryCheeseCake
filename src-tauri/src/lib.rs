use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::watch;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadedYoutubeVideo {
    path: String,
    bytes_written: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConvertedMp3 {
    path: String,
    bytes_written: u64,
}

#[cfg(target_os = "windows")]
const FFMPEG_FILE: &str = "ffmpeg.exe";
#[cfg(not(target_os = "windows"))]
const FFMPEG_FILE: &str = "ffmpeg";

fn use_ffmpeg_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let candidates = [
        app.path()
            .resource_dir()
            .ok()
            .map(|path| path.join("ffmpeg-static").join(FFMPEG_FILE)),
        Some(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("node_modules")
                .join("ffmpeg-static")
                .join(FFMPEG_FILE),
        ),
    ];

    candidates
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
        .ok_or_else(|| "FFmpeg is not bundled with this application".to_string())
}

fn youtube_video_url(source: &str) -> Result<String, String> {
    let url = url::Url::parse(source).map_err(|_| "Enter a valid YouTube URL".to_string())?;
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "https"
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Enter a valid YouTube URL".to_string());
    }
    let segments: Vec<_> = url
        .path_segments()
        .map(|s| s.filter(|p| !p.is_empty()).collect())
        .unwrap_or_default();
    let id = if host == "youtu.be" {
        segments.first().map(|s| s.to_string())
    } else if host == "youtube.com" || host.ends_with(".youtube.com") {
        if segments.first() == Some(&"watch") {
            url.query_pairs()
                .find(|(key, _)| key == "v")
                .map(|(_, value)| value.into_owned())
        } else if matches!(segments.first(), Some(&"shorts" | &"live" | &"embed")) {
            segments.get(1).map(|s| s.to_string())
        } else {
            None
        }
    } else {
        None
    };
    let id = id
        .filter(|id| {
            id.len() == 11
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        })
        .ok_or_else(|| "Enter a valid YouTube video URL".to_string())?;
    Ok(format!("https://www.youtube.com/watch?v={id}"))
}

fn youtube_tool_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("youtube-download-tools").join(name));
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("node_modules")
        .join("youtube-download-tools")
        .join(name);
    bundled
        .into_iter()
        .chain(std::iter::once(development))
        .find(|path| path.is_file())
        .ok_or_else(|| {
            format!("{name} is missing. Run npm run prepare:youtube and rebuild the app.")
        })
}

#[derive(Default)]
struct DownloadState(Mutex<Option<(String, watch::Sender<bool>)>>);

#[tauri::command]
fn begin_youtube_download(id: String, state: State<'_, DownloadState>) -> Result<(), String> {
    let mut active = state.0.lock().map_err(|_| "Could not start download")?;
    if active.is_some() {
        return Err("A download is already in progress".to_string());
    }
    let (cancel, _) = watch::channel(false);
    *active = Some((id, cancel));
    Ok(())
}

#[tauri::command]
fn cancel_youtube_download(id: String, state: State<'_, DownloadState>) -> Result<(), String> {
    let active = state.0.lock().map_err(|_| "Could not cancel download")?;
    if let Some((current, cancel)) = active.as_ref() {
        if *current == id {
            cancel.send_replace(true);
        }
    }
    Ok(())
}

#[tauri::command]
fn release_youtube_download(id: String, state: State<'_, DownloadState>) -> Result<(), String> {
    let mut active = state.0.lock().map_err(|_| "Could not release download")?;
    if active.as_ref().is_some_and(|(current, _)| *current == id) {
        *active = None;
    }
    Ok(())
}

async fn stop_download_process(child: &mut tokio::process::Child) -> Result<(), String> {
    let pid = child
        .id()
        .ok_or("Could not identify the download process")?;
    #[cfg(windows)]
    {
        let system = std::env::var_os("SystemRoot").ok_or("Could not find Windows system tools")?;
        let taskkill = PathBuf::from(system).join("System32").join("taskkill.exe");
        let killed = Command::new(taskkill)
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x08000000)
            .status()
            .await
            .map_err(|e| format!("Could not stop the download: {e}"))?;
        if !killed.success() && child.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Err("Could not stop the download. Please try again.".to_string());
        }
    }
    #[cfg(not(windows))]
    child
        .kill()
        .await
        .map_err(|e| format!("Could not stop the download: {e}"))?;
    Ok(())
}

fn youtube_progress_status(line: &str) -> Option<String> {
    if let Some(percent) = line.strip_prefix("APP_PROGRESS:") {
        Some(format!(
            "Downloading a video or audio track: {}",
            percent.trim()
        ))
    } else if line.starts_with("[Merger]") {
        Some("Combining video and audio...".to_string())
    } else if line.contains("[jsc:quickjs]") {
        Some("Preparing the video...".to_string())
    } else if line.starts_with("[youtube]") || line.starts_with("[info]") {
        Some("Checking video and available formats...".to_string())
    } else {
        None
    }
}

#[tauri::command]
async fn download_youtube_video(
    app: tauri::AppHandle,
    id: String,
    source: String,
    destination: String,
    state: State<'_, DownloadState>,
) -> Result<DownloadedYoutubeVideo, String> {
    let cancel = {
        let active = state.0.lock().map_err(|_| "Could not start download")?;
        active
            .as_ref()
            .filter(|(current, _)| *current == id)
            .map(|(_, sender)| sender.subscribe())
            .ok_or("Download is no longer active")?
    };
    let result = run_youtube_download(app, source, destination, cancel).await;
    release_youtube_download(id, state)?;
    result
}

async fn run_youtube_download(
    app: tauri::AppHandle,
    source: String,
    destination: String,
    mut cancel: watch::Receiver<bool>,
) -> Result<DownloadedYoutubeVideo, String> {
    if *cancel.borrow() {
        return Err("Download cancelled".to_string());
    }
    let source = youtube_video_url(&source)?;
    if destination.trim().is_empty() {
        return Err("Choose where to save the video file".to_string());
    }
    let destination = PathBuf::from(destination);
    if !destination
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("mp4"))
    {
        return Err("Choose an MP4 filename".to_string());
    }
    let ytdlp = youtube_tool_path(&app, "yt-dlp.exe")?;
    let qjs = youtube_tool_path(&app, "qjs.exe")?;
    let ffmpeg = use_ffmpeg_path(&app)?;
    if tokio::fs::try_exists(&destination)
        .await
        .map_err(|e| format!("Could not inspect destination: {e}"))?
    {
        return Err(format!("{} already exists", destination.display()));
    }
    let temporary = tempfile::Builder::new()
        .prefix(".youtube-download-")
        .tempdir_in(
            destination
                .parent()
                .unwrap_or_else(|| std::path::Path::new(".")),
        )
        .map_err(|e| format!("Could not create temporary download folder: {e}"))?;
    let result = async {
        if *cancel.borrow() {
            return Err("Download cancelled".to_string());
        }
        let mut child = Command::new(ytdlp)
            .args([
                "--ignore-config",
                "--no-playlist",
                "--newline",
                "--progress-template",
                "download:APP_PROGRESS:%(progress._percent_str)s",
                "--no-overwrites",
                "--no-write-playlist-metafiles",
                "--format",
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4][acodec!=none]",
                "--merge-output-format",
                "mp4",
                "--js-runtimes",
            ])
            .arg(format!("quickjs:{}", qjs.display()))
            .arg("--ffmpeg-location")
            .arg(ffmpeg)
            .arg("--paths")
            .arg(temporary.path())
            .args(["--output", "video.%(ext)s", "--", &source])
            .env("YTDLP_NO_PLUGINS", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUNBUFFERED", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to start yt-dlp: {e}"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Could not read yt-dlp progress")?;
        let progress_app = app.clone();
        let progress = tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(status) = youtube_progress_status(&line) {
                    let _ = progress_app.emit("youtube-download-progress", status);
                }
            }
        });
        let mut stderr = child.stderr.take().ok_or("Could not read yt-dlp errors")?;
        let error_output = tokio::spawn(async move {
            let mut bytes = Vec::new();
            let _ = stderr.read_to_end(&mut bytes).await;
            bytes
        });
        let status = tokio::select! {
            biased;
            status = child.wait() => status.map_err(|e| format!("Failed to run yt-dlp: {e}"))?,
            _ = async {
                if !*cancel.borrow() { let _ = cancel.changed().await; }
            } => {
                stop_download_process(&mut child).await?;
                let _ = child.wait().await;
                let _ = progress.await;
                let _ = error_output.await;
                return Err("Download cancelled".to_string());
            }
        };
        let _ = progress.await;
        let stderr = error_output.await.unwrap_or_default();
        if !status.success() {
            let details = String::from_utf8_lossy(&stderr);
            return Err(format!(
                "yt-dlp could not download the video: {}",
                details.trim()
            ));
        }
        if *cancel.borrow() {
            return Err("Download cancelled".to_string());
        }
        let video = temporary.path().join("video.mp4");
        let bytes_written = tokio::fs::metadata(&video)
            .await
            .map_err(|e| format!("Could not inspect downloaded MP4: {e}"))?
            .len();
        if bytes_written == 0 {
            return Err("Downloaded video is empty".to_string());
        }
        // A hard link fails if another file appears at the destination during the download.
        tokio::fs::hard_link(&video, &destination)
            .await
            .map_err(|e| format!("Could not save {}: {e}", destination.display()))?;
        Ok(DownloadedYoutubeVideo {
            path: destination.to_string_lossy().into_owned(),
            bytes_written,
        })
    }
    .await;
    let temporary_path = temporary.path().to_path_buf();
    if let Err(error) = temporary.close() {
        if let Err(ref failure) = result {
            return Err(format!(
                "{failure}. Temporary files could not be removed from {}: {error}",
                temporary_path.display()
            ));
        }
    }
    result
}

#[tauri::command]
async fn convert_mp4_to_mp3(
    app: tauri::AppHandle,
    source: String,
    destination: String,
) -> Result<ConvertedMp3, String> {
    if source.trim().is_empty() || destination.trim().is_empty() {
        return Err("Choose an MP4 file and an output location".to_string());
    }

    let source = PathBuf::from(source);
    let destination = PathBuf::from(destination);
    if !source.is_file() {
        return Err("The selected MP4 file does not exist".to_string());
    }
    if source
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| !extension.eq_ignore_ascii_case("mp4"))
        .unwrap_or(true)
    {
        return Err("Please choose an MP4 file".to_string());
    }
    if destination.exists() {
        return Err(format!("{} already exists", destination.display()));
    }

    let ffmpeg = use_ffmpeg_path(&app)?;
    let temporary_dir = tempfile::Builder::new()
        .prefix(".mp3-conversion-")
        .tempdir_in(
            destination
                .parent()
                .unwrap_or_else(|| std::path::Path::new(".")),
        )
        .map_err(|error| format!("Could not create temporary conversion folder: {error}"))?;
    let temporary = temporary_dir.path().join("audio.mp3");

    let result = Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-i"])
        .arg(&source)
        .args([
            "-map",
            "0:a:0",
            "-map",
            "0:v:0?",
            "-map_metadata",
            "0",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            "-c:v",
            "mjpeg",
            "-filter:v",
            "select=eq(n\\,0)",
            "-fps_mode:v",
            "passthrough",
            "-disposition:v",
            "attached_pic",
            "-id3v2_version",
            "3",
            "-f",
            "mp3",
            "-metadata:s:v",
            "title=Album cover",
            "-metadata:s:v",
            "comment=Cover (front)",
        ])
        .arg(&temporary)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|error| format!("Failed to run FFmpeg: {error}"))?;

    if !result.status.success() {
        let details = String::from_utf8_lossy(&result.stderr).trim().to_string();
        return Err(if details.is_empty() {
            "FFmpeg could not convert the MP4 file".to_string()
        } else {
            format!("FFmpeg could not convert the MP4 file: {details}")
        });
    }

    save_converted_file(&temporary, &destination).await?;

    let bytes_written = tokio::fs::metadata(&destination)
        .await
        .map_err(|error| format!("Could not inspect {}: {error}", destination.display()))?
        .len();

    Ok(ConvertedMp3 {
        path: destination.to_string_lossy().into_owned(),
        bytes_written,
    })
}

async fn save_converted_file(
    source: &std::path::Path,
    destination: &std::path::Path,
) -> Result<(), String> {
    tokio::fs::hard_link(source, destination)
        .await
        .map_err(|error| format!("Could not save {}: {error}", destination.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DownloadState::default())
        .setup(|app| {
            #[cfg(debug_assertions)] // dev debug
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
                window.close_devtools();
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            begin_youtube_download,
            download_youtube_video,
            cancel_youtube_download,
            release_youtube_download,
            convert_mp4_to_mp3
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persistent_read_scope_allows_audio_but_not_arbitrary_files() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let permissions = capability["permissions"].as_array().unwrap();
        let read_scope = permissions
            .iter()
            .find(|permission| permission["identifier"] == "fs:allow-read-file")
            .unwrap();
        let patterns: Vec<_> = read_scope["allow"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| tauri::scope::fs::Pattern::new(entry["path"].as_str().unwrap()).unwrap())
            .collect();
        for path in ["C:/Music/song.mp3", "D:/Music/SONG.WAV"] {
            assert!(
                patterns.iter().any(|pattern| pattern.matches(path)),
                "{path}"
            );
        }
        assert!(!patterns
            .iter()
            .any(|pattern| pattern.matches("C:/Users/user/secrets.txt")));
    }

    #[test]
    fn conversion_does_not_replace_a_file_created_during_conversion() {
        tauri::async_runtime::block_on(async {
            let dir = tempfile::tempdir().unwrap();
            let source = dir.path().join("converted.mp3");
            let destination = dir.path().join("existing.mp3");
            std::fs::write(&source, b"converted").unwrap();
            std::fs::write(&destination, b"keep me").unwrap();
            assert!(save_converted_file(&source, &destination).await.is_err());
            assert_eq!(std::fs::read(&destination).unwrap(), b"keep me");
        });
    }

    #[cfg(windows)]
    #[test]
    fn cancellation_stops_the_process_tree() {
        tauri::async_runtime::block_on(async {
            let system = std::env::var_os("SystemRoot").unwrap();
            let powershell = PathBuf::from(&system)
                .join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe");
            let tasklist = PathBuf::from(system).join("System32").join("tasklist.exe");
            let temp = tempfile::tempdir().unwrap();
            let pid_file = temp.path().join("child-pid.txt");
            let script = "$p = Start-Process -FilePath ping.exe -ArgumentList '-n','30','127.0.0.1' -WindowStyle Hidden -PassThru; $p.Id | Set-Content -LiteralPath $env:DOWNLOAD_TEST_PID; $p.WaitForExit()";
            let mut child = Command::new(powershell)
                .args(["-NoProfile", "-NonInteractive", "-Command", script])
                .env("DOWNLOAD_TEST_PID", &pid_file)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(0x08000000)
                .spawn()
                .unwrap();
            for _ in 0..100 {
                if pid_file.exists() {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            let descendant = std::fs::read_to_string(&pid_file)
                .expect("child process did not start")
                .trim()
                .to_string();
            stop_download_process(&mut child).await.unwrap();
            assert!(!child.wait().await.unwrap().success());
            let output = Command::new(tasklist)
                .args(["/FI", &format!("PID eq {descendant}"), "/NH", "/FO", "CSV"])
                .creation_flags(0x08000000)
                .output()
                .await
                .unwrap();
            assert!(
                !String::from_utf8_lossy(&output.stdout).contains(&format!("\"{descendant}\"")),
                "child process survived cancellation"
            );
        });
    }

    #[test]
    fn cancellation_requested_before_start_is_preserved() {
        let (sender, _) = watch::channel(false);
        sender.send_replace(true);
        assert!(*sender.subscribe().borrow());
    }

    #[test]
    fn reports_ytdlp_download_stages() {
        assert_eq!(
            youtube_progress_status("APP_PROGRESS: 42.1%"),
            Some("Downloading a video or audio track: 42.1%".to_string())
        );
        assert_eq!(
            youtube_progress_status("[Merger] Merging formats"),
            Some("Combining video and audio...".to_string())
        );
        assert_eq!(
            youtube_progress_status("[youtube] Downloading webpage"),
            Some("Checking video and available formats...".to_string())
        );
        assert_eq!(youtube_progress_status("unrelated output"), None);
    }

    #[test]
    fn validates_and_canonicalizes_youtube_links() {
        let canonical = "https://www.youtube.com/watch?v=BaW_jenozKc";
        for url in [
            canonical,
            "https://youtu.be/BaW_jenozKc?t=4",
            "https://youtube.com/shorts/BaW_jenozKc",
            "https://www.youtube.com/live/BaW_jenozKc",
            "https://youtube.com/embed/BaW_jenozKc",
        ] {
            assert_eq!(youtube_video_url(url).unwrap(), canonical);
        }
        for url in [
            "http://youtube.com/watch?v=BaW_jenozKc",
            "https://youtube.com.evil.test/watch?v=BaW_jenozKc",
            "https://youtube.com/watch?v=abc",
            "https://youtube.com:444/watch?v=BaW_jenozKc",
            "https://user@youtube.com/watch?v=BaW_jenozKc",
            "https://youtube.com/playlist?list=abc",
        ] {
            assert!(youtube_video_url(url).is_err(), "accepted {url}");
        }
    }
}
