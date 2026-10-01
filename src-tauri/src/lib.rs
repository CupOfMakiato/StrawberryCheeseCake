use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::Manager;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

const YOUTUBE_CHUNK_SIZE: u64 = 10 << 20;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadedYoutubeVideo {
    video_id: String,
    title: String,
    path: String,
    bytes_written: u64,
    extension: String,
    has_audio: bool,
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

fn use_youtube_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        )
        .build()
        .map_err(|error| format!("Failed to create the HTTP client: {error}"))
}

fn use_validate_video_source(source: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(source)
        .map_err(|_| "The resolved YouTube video URL is invalid".to_string())?;
    let host = url.host_str().unwrap_or_default();

    if url.scheme() != "https" || (host != "googlevideo.com" && !host.ends_with(".googlevideo.com"))
    {
        return Err("YouTube returned an unexpected video host".to_string());
    }

    Ok(url)
}

fn use_with_youtube_range(source: &reqwest::Url, start: u64, end: u64) -> reqwest::Url {
    let mut ranged = source.clone();
    let query = ranged
        .query_pairs()
        .filter(|(key, _)| key != "range")
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();

    ranged.set_query(None);
    ranged
        .query_pairs_mut()
        .extend_pairs(query)
        .append_pair("range", &format!("{start}-{end}"));
    ranged
}

#[tauri::command]
async fn download_youtube_video(
    source: String,
    destination: String,
    video: String,
    title: String,
    extension: String,
    audio: bool,
    content_length: Option<u64>,
) -> Result<DownloadedYoutubeVideo, String> {
    if destination.trim().is_empty() {
        return Err("Choose where to save the video file".to_string());
    }

    let client = use_youtube_client()?;
    let source = use_validate_video_source(&source)?;
    let content_length = content_length.filter(|length| *length > 0);
    let destination = PathBuf::from(destination);
    if tokio::fs::try_exists(&destination)
        .await
        .map_err(|error| format!("Could not inspect {}: {error}", destination.display()))?
    {
        return Err(format!("{} already exists", destination.display()));
    }
    let mut temporary = destination.as_os_str().to_os_string();
    temporary.push(".part");
    let temporary = PathBuf::from(temporary);
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .await
        .map_err(|error| format!("Could not create {}: {error}", temporary.display()))?;
    let mut bytes_written = 0;

    let download = async {
        let mut range_start = 0;

        loop {
            let range_end = content_length
                .map(|length| (range_start + YOUTUBE_CHUNK_SIZE - 1).min(length - 1));
            let request_url = range_end
                .map(|end| use_with_youtube_range(&source, range_start, end))
                .unwrap_or_else(|| source.clone());
            let mut response = client
                .get(request_url)
                .header("Accept", "*/*")
                .header("Origin", "https://www.youtube.com")
                .header("Referer", "https://www.youtube.com")
                .header("DNT", "?1")
                .send()
                .await
                .map_err(|error| format!("Failed to start the video download: {error}"))?
                .error_for_status()
                .map_err(|error| format!("The video download was rejected: {error}"))?;
            let bytes_before_chunk = bytes_written;

            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|error| format!("The video download stopped early: {error}"))?
            {
                file.write_all(&chunk)
                    .await
                    .map_err(|error| format!("Failed to write the video file: {error}"))?;
                bytes_written += chunk.len() as u64;
            }

            let Some(range_end) = range_end else {
                break;
            };
            let expected = range_end - range_start + 1;
            let received = bytes_written - bytes_before_chunk;
            if received != expected {
                return Err(format!(
                    "The video download stopped early (expected {expected} bytes, received {received})"
                ));
            }

            range_start = range_end + 1;
            if range_start >= content_length.unwrap_or_default() {
                break;
            }
        }

        file.flush()
            .await
            .map_err(|error| format!("Failed to finish the video file: {error}"))
    }
    .await;

    drop(file);
    if let Err(error) = download {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(error);
    }

    if let Err(error) = tokio::fs::rename(&temporary, &destination).await {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(format!(
            "Could not save {} (the file may already exist): {error}",
            destination.display()
        ));
    }

    Ok(DownloadedYoutubeVideo {
        video_id: video,
        title,
        path: destination.to_string_lossy().into_owned(),
        bytes_written,
        extension,
        has_audio: audio,
    })
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
    let mut temporary = destination.as_os_str().to_os_string();
    temporary.push(".part");
    let temporary = PathBuf::from(temporary);
    if temporary.exists() {
        return Err(format!("{} already exists", temporary.display()));
    }

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
        let _ = tokio::fs::remove_file(&temporary).await;
        let details = String::from_utf8_lossy(&result.stderr).trim().to_string();
        return Err(if details.is_empty() {
            "FFmpeg could not convert the MP4 file".to_string()
        } else {
            format!("FFmpeg could not convert the MP4 file: {details}")
        });
    }

    if let Err(error) = tokio::fs::rename(&temporary, &destination).await {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(format!("Could not save {}: {error}", destination.display()));
    }

    let bytes_written = tokio::fs::metadata(&destination)
        .await
        .map_err(|error| format!("Could not inspect {}: {error}", destination.display()))?
        .len();

    Ok(ConvertedMp3 {
        path: destination.to_string_lossy().into_owned(),
        bytes_written,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .plugin(tauri_plugin_http::init())
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
            download_youtube_video,
            convert_mp4_to_mp3
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_https_googlevideo_sources() {
        assert!(use_validate_video_source(
            "https://rr2---sn.example.googlevideo.com/videoplayback?id=abc"
        )
        .is_ok());
        assert!(use_validate_video_source("https://googlevideo.com.evil.test/video").is_err());
        assert!(use_validate_video_source("http://rr.googlevideo.com/video").is_err());
    }

    #[test]
    fn replaces_youtube_range_without_losing_other_query_values() {
        let source =
            use_validate_video_source("https://rr.googlevideo.com/videoplayback?id=abc&range=0-0")
                .unwrap();
        let ranged = use_with_youtube_range(&source, 10, 19);
        let query = ranged.query_pairs().collect::<Vec<_>>();

        assert!(query.contains(&("id".into(), "abc".into())));
        assert_eq!(
            query
                .iter()
                .filter(|(key, value)| key == "range" && value == "10-19")
                .count(),
            1
        );
    }
}
