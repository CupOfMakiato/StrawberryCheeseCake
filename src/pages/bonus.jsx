import {
    downloadYouTubeVideo,
    extractYouTubeVideoId,
    resetYouTubeSession,
    resolveYouTubeVideo,
} from '../services/link-service'
import { open, save } from '@tauri-apps/plugin-dialog'
import { useState } from 'react'
import { convertMp4ToMp3 } from '../services/conversion-service'
import { getBaseName } from '../utils/file-path'

const Bonus = () => {
    const [youtubeUrl, setYoutubeUrl] = useState('')
    const [downloadStatus, setDownloadStatus] = useState('')
    const [isDownloading, setIsDownloading] = useState(false)
    const [conversionStatus, setConversionStatus] = useState('')
    const [isConverting, setIsConverting] = useState(false)

    async function downloadYoutubeVideo(event) {
        event.preventDefault()
        const videoId = extractYouTubeVideoId(youtubeUrl)

        if (!videoId) {
            setDownloadStatus('Enter a valid YouTube URL.')
            return
        }

        setIsDownloading(true)
        setDownloadStatus('Checking available video formats...')

        try {
            const video = await resolveYouTubeVideo(youtubeUrl)
            const destination = await save({
                title: 'Save YouTube video',
                defaultPath: `${videoId}.${video.extension}`,
                filters: [
                    {
                        name: `${video.extension.toUpperCase()} video`,
                        extensions: [video.extension],
                    },
                ],
            })

            if (!destination) {
                setDownloadStatus('Download cancelled.')
                return
            }

            setDownloadStatus(
                video.hasAudio ? 'Downloading video...' : 'Downloading video-only stream...',
            )
            const result = await downloadYouTubeVideo(video, destination)
            setDownloadStatus(
                `Downloaded “${result.title}” (${(result.bytesWritten / 1024 / 1024).toFixed(1)} MB${result.hasAudio ? '' : ', no audio'}).`,
            )
        } catch (error) {
            console.error('Failed to download YouTube video:', error)
            setDownloadStatus(`Download failed: ${String(error)}`)
        } finally {
            setIsDownloading(false)
        }
    }

    async function convertVideo(event) {
        event.preventDefault()
        setIsConverting(true)
        setConversionStatus('Choose an MP4 video...')

        try {
            const source = await open({
                title: 'Choose an MP4 video',
                multiple: false,
                filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
            })

            if (typeof source !== 'string' || !source) {
                setConversionStatus('Conversion cancelled.')
                return
            }

            const sourceName = getBaseName(source, 'converted-video.mp4')
            const defaultName = sourceName.replace(/\.mp4$/i, '') + '.mp3'
            const destination = await save({
                title: 'Save MP3 audio',
                defaultPath: defaultName,
                filters: [{ name: 'MP3 audio', extensions: ['mp3'] }],
            })

            if (!destination) {
                setConversionStatus('Conversion cancelled.')
                return
            }

            setConversionStatus('Converting audio...')
            const result = await convertMp4ToMp3(source, destination)
            setConversionStatus(`Converted to MP3 ${result.path}`)
        } catch (error) {
            console.error('Failed to convert MP4 to MP3:', error)
            setConversionStatus(`Conversion failed: ${String(error)}`)
        } finally {
            setIsConverting(false)
        }
    }

    return (
        <main className="space-y-2">
            <p
            // className="text-2xl font-bold text-gray-800"
            >
                The url download requires internet connection since it's involve from google video
                service.
            </p>
            <p>
                The mp4 to mp3 conversion is done locally and does not require internet connection
                (it uses ffmpeg from the bundled app)
            </p>
            <form
                className="flex max-w-2xl flex-col gap-2 rounded-lg border border-gray-300 bg-white p-3 shadow-sm mt-2"
                onSubmit={downloadYoutubeVideo}
            >
                <label className="text-sm font-semibold text-gray-800" htmlFor="youtubeUrl">
                    YouTube download (test, might have some issues)
                </label>
                <div className="flex gap-2">
                    <input
                        className="min-w-0 flex-1 rounded border border-gray-400 px-3 py-2 text-gray-800"
                        id="youtubeUrl"
                        type="url"
                        placeholder="https://youtube.com/watch?v=..."
                        value={youtubeUrl}
                        disabled={isDownloading || isConverting}
                        onChange={(event) => setYoutubeUrl(event.target.value)}
                        required
                    />
                    <button
                        className="rounded border border-gray-400 bg-white px-3 py-2 font-semibold text-gray-800 shadow hover:bg-gray-100 disabled:opacity-60"
                        type="submit"
                        disabled={isDownloading || isConverting}
                    >
                        {isDownloading ? 'Downloading...' : 'Download Video'}
                    </button>
                </div>
                {downloadStatus && (
                    <p className="wrap-break-word text-sm text-gray-700" role="status">
                        {downloadStatus}
                    </p>
                )}
                {/\b403\b/.test(downloadStatus) && (
                    <button
                        className="self-start rounded border border-gray-400 bg-white px-3 py-2 font-semibold text-gray-800 shadow hover:bg-gray-100 disabled:opacity-60"
                        type="button"
                        disabled={isDownloading || isConverting}
                        onClick={() => {
                            resetYouTubeSession()
                            setDownloadStatus('YouTube session reset. Try the download again.')
                        }}
                    >
                        Reset YouTube session
                    </button>
                )}
            </form>

            <form
                className="flex max-w-2xl flex-col gap-2 rounded-lg border border-gray-300 bg-white p-3 shadow-sm"
                onSubmit={convertVideo}
            >
                <span className="text-sm font-semibold text-gray-800">Convert MP4 to MP3</span>
                <button
                    className="self-start rounded border border-gray-400 bg-white px-3 py-2 font-semibold text-gray-800 shadow hover:bg-gray-100 disabled:opacity-60"
                    type="submit"
                    disabled={isDownloading || isConverting}
                >
                    {isConverting ? 'Converting...' : 'Choose MP4'}
                </button>
                {conversionStatus && (
                    <p className="wrap-break-word text-sm text-gray-700" role="status">
                        {conversionStatus}
                    </p>
                )}
            </form>
        </main>
    )
}

export default Bonus
