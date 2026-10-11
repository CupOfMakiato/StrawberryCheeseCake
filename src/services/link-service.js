import { invoke } from '@tauri-apps/api/core'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

const STREAM_HEADERS = {
    accept: '*/*',
    origin: 'https://www.youtube.com',
    referer: 'https://www.youtube.com',
    DNT: '?1',
}
const YOUTUBE_CLIENTS = ['ANDROID_VR', 'ANDROID', 'IOS', 'TV_SIMPLY', 'WEB_EMBEDDED', 'WEB']
let youtubePromise

function youtubeFetch(input, init = {}) {
    const headers = new Headers(init.headers)
    headers.set('origin', 'https://www.youtube.com')
    return tauriFetch(input, { ...init, headers })
}

function getYouTubeClient() {
    if (!youtubePromise) {
        youtubePromise = import('youtubei.js/web')
            .then(({ Innertube, Platform }) => {
                Platform.shim.eval = async (data) => Function(data.output)()
                return Innertube.create({ fetch: youtubeFetch })
            })
            .catch((error) => {
                youtubePromise = null
                throw error
            })
    }

    return youtubePromise
}

export function resetYouTubeSession() {
    youtubePromise = null
}

function extensionForMimeType(mimeType) {
    return (
        {
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'video/3gpp': '3gp',
            'video/x-flv': 'flv',
        }[mimeType] || 'video'
    )
}

function getVideoFormats(info) {
    return [
        ...(info.streaming_data?.formats || []),
        ...(info.streaming_data?.adaptive_formats || []),
    ]
        .filter((format) => format.has_video && !format.is_type_otf && !format.drm_families?.length)
        .sort(
            (left, right) =>
                Number(right.has_audio) - Number(left.has_audio) ||
                (right.bitrate || 0) - (left.bitrate || 0),
        )
        .slice(0, 8)
}

export function extractYouTubeVideoId(link) {
    try {
        const url = new URL(link)
        const host = url.hostname.toLowerCase().replace(/^www\./, '')
        let videoId = null

        if (!['http:', 'https:'].includes(url.protocol)) return null

        if (host === 'youtu.be') {
            videoId = url.pathname.split('/').filter(Boolean)[0] || null
        } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
            videoId = url.searchParams.get('v')
        }

        return videoId && /^[\w-]+$/.test(videoId) ? videoId : null
    } catch {
        return null
    }
}

export async function resolveYouTubeVideo(link) {
    const videoId = extractYouTubeVideoId(link)
    if (!videoId) throw new Error('Enter a valid YouTube URL.')

    const youtube = await getYouTubeClient()
    const failures = []

    for (const client of YOUTUBE_CLIENTS) {
        try {
            const info = await youtube.getBasicInfo(videoId, { client })
            const formats = getVideoFormats(info)
            let lastFormatError

            for (const format of formats) {
                try {
                    const sourceUrl = new URL(await format.decipher(youtube.session.player))
                    sourceUrl.searchParams.set('cpn', info.cpn)

                    const probeUrl = new URL(sourceUrl)
                    probeUrl.searchParams.set('range', '0-0')
                    const probe = await tauriFetch(probeUrl, { headers: STREAM_HEADERS })
                    await probe.arrayBuffer()
                    if (!probe.ok) throw new Error(`stream returned HTTP ${probe.status}`)

                    const mimeType = format.mime_type.split(';')[0]
                    return {
                        videoId,
                        title: info.basic_info.title || 'YouTube video',
                        url: sourceUrl.toString(),
                        mimeType,
                        extension: extensionForMimeType(mimeType),
                        hasAudio: format.has_audio,
                        qualityLabel: format.quality_label || null,
                        contentLength: format.content_length || null,
                    }
                } catch (error) {
                    lastFormatError = error
                }
            }

            const reason = lastFormatError instanceof Error ? lastFormatError.message : 'no formats'
            throw new Error(`${formats.length} video formats were rejected; last error: ${reason}`)
        } catch (error) {
            failures.push(`${client}: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    const tokenHint = failures.some((failure) => /\b403\b/.test(failure))
        ? ' YouTube is requiring a PO token or sign-in for this video.'
        : ''
    throw new Error(
        `YouTube did not return a working video stream.${tokenHint} ${failures.join(' | ')}`,
    )
}

export async function downloadYouTubeVideo(video, destination) {
    return invoke('download_youtube_video', {
        source: video.url,
        destination,
        video: video.videoId,
        title: video.title,
        extension: video.extension,
        audio: video.hasAudio,
        contentLength: video.contentLength,
    })
}
