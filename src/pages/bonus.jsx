import { beginYouTubeDownload, cancelYouTubeDownload, downloadYouTubeVideo, releaseYouTubeDownload } from '../services/link-service'
import { confirm, open, save } from '@tauri-apps/plugin-dialog'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { convertMp4ToMp3 } from '../services/conversion-service'
import { getBaseName } from '../utils/file-path'

const Bonus = () => {
    const [youtubeUrl, setYoutubeUrl] = useState('')
    const [downloadStatus, setDownloadStatus] = useState('')
    const [isDownloading, setIsDownloading] = useState(false)
    const [isCancelling, setIsCancelling] = useState(false)
    const [downloadPath, setDownloadPath] = useState('')
    const activeDownload = useRef(null)
    const submitting = useRef(false)
    const confirmation = useRef(false)
    const cancelling = useRef(false)
    const [conversionStatus, setConversionStatus] = useState('')
    const [isConverting, setIsConverting] = useState(false)

    const blocker = useBlocker(({ currentLocation, nextLocation }) =>
        isDownloading && currentLocation.pathname !== nextLocation.pathname,
    )
    const blockerRef = useRef(blocker)
    blockerRef.current = blocker
    const handlingBlock = useRef(false)

    async function confirmCancellation(reason) {
        const job = activeDownload.current
        if (!job) return !submitting.current
        if (confirmation.current) return false
        confirmation.current = true
        try {
            const accepted = await confirm(
                reason === 'leave'
                    ? 'Leaving this page will stop the download. The incomplete file will be removed.'
                    : reason === 'close'
                      ? 'Closing the app will stop the download. The incomplete file will be removed.'
                      : 'The incomplete file will be removed. You can start again later.',
                { title: 'Cancel download?', kind: 'warning', okLabel: 'Cancel download', cancelLabel: 'Keep downloading' },
            )
            if (!accepted) return false
            cancelling.current = true
            setIsCancelling(true)
            setDownloadStatus('Cancelling download...')
            await job.ready
            await cancelYouTubeDownload(job.id)
            try {
                await job.done
            } catch (error) {
                if (String(error).startsWith('Could not stop the download') || String(error).includes('Temporary files could not be removed')) throw error
            }
            return true
        } catch (error) {
            setDownloadStatus('Could not cancel the download: ' + String(error))
            return false
        } finally {
            confirmation.current = false
            cancelling.current = false
            setIsCancelling(false)
        }
    }

    const confirmRef = useRef(confirmCancellation)
    confirmRef.current = confirmCancellation

    useEffect(() => {
        if (blocker.state !== 'blocked' || handlingBlock.current) return
        handlingBlock.current = true
        void (async () => {
            const leave = await confirmRef.current('leave')
            if (blockerRef.current.state === 'blocked') {
                if (leave) blockerRef.current.proceed()
                else blockerRef.current.reset()
            }
            handlingBlock.current = false
        })()
    }, [blocker])

    useEffect(() => {
        if (!isTauri()) return
        let disposed = false
        let unlisten
        getCurrentWindow().onCloseRequested(async (event) => {
            if (!activeDownload.current) return
            if (!(await confirmRef.current('close'))) event.preventDefault()
        }).then((cleanup) => {
            if (disposed) cleanup()
            else unlisten = cleanup
        }).catch((error) => console.error('Could not watch window close:', error))
        return () => {
            disposed = true
            unlisten?.()
        }
    }, [])

    async function downloadYoutubeVideo(event) {
        event.preventDefault()
        if (submitting.current) return
        submitting.current = true
        setIsDownloading(true)
        setDownloadPath('')
        setDownloadStatus('Choose where to save the video...')
        let unlisten
        let job

        try {
            const destination = await save({
                title: 'Save YouTube video',
                defaultPath: 'youtube-video.mp4',
                filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
            })
            if (!destination) {
                setDownloadStatus('No file selected. The download did not start.')
                return
            }

            unlisten = await listen('youtube-download-progress', ({ payload }) => {
                if (!cancelling.current) setDownloadStatus(payload)
            })
            setDownloadStatus('Checking video and available formats...')
            const id = crypto.randomUUID()
            const ready = beginYouTubeDownload(id)
            const done = ready.then(() => downloadYouTubeVideo(id, youtubeUrl, destination))
            job = { id, ready, done }
            activeDownload.current = job
            setDownloadPath(destination)
            const result = await done
            setDownloadStatus('Downloaded ' + result.path + ' (' + (result.bytesWritten / 1024 / 1024).toFixed(1) + ' MB).')
        } catch (error) {
            if (String(error) === 'Download cancelled') {
                setDownloadStatus('Download cancelled. No file was saved.')
            } else {
                console.error('Failed to download YouTube video:', error)
                setDownloadStatus('Download failed: ' + String(error))
            }
        } finally {
            if (job) await releaseYouTubeDownload(job.id).catch(console.error)
            activeDownload.current = null
            unlisten?.()
            submitting.current = false
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
                {isDownloading && downloadPath && (
                    <p className="wrap-break-word text-sm text-gray-700">Saving to {downloadPath}</p>
                )}
                {downloadStatus && (
                    <p className="wrap-break-word text-sm text-gray-700" role="status" aria-live="polite">
                        {downloadStatus}
                    </p>
                )}
                {isDownloading && downloadPath && (
                    <>
                        <p className="text-sm text-gray-700">Preparing a video can take a few minutes. Please keep this page open.</p>
                        <button
                            className="self-start rounded border border-gray-400 bg-white px-3 py-2 font-semibold text-gray-800 shadow hover:bg-gray-100 disabled:opacity-60"
                            type="button"
                            disabled={isCancelling}
                            onClick={() => void confirmCancellation('cancel')}
                        >
                            {isCancelling ? 'Cancelling...' : 'Cancel download'}
                        </button>
                    </>
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
