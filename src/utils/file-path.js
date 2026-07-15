import { convertFileSrc } from '@tauri-apps/api/core'

function toFileUrl(filePath) {
    if (!filePath) return null

    const normalizedPath = String(filePath).replace(/\\/g, '/')
    const needsLeadingSlash = /^[A-Za-z]:\//.test(normalizedPath)
    return encodeURI(`file://${needsLeadingSlash ? '/' : ''}${normalizedPath}`)
}

function fromFileUrl(fileUrl) {
    try {
        const url = new URL(fileUrl)
        if (url.protocol !== 'file:') {
            return fileUrl
        }

        const path = decodeURIComponent(url.pathname)
        if (url.host) {
            return `\\\\${url.host}${path.replace(/\//g, '\\')}`
        }

        return /^\/[A-Za-z]:\//.test(path) ? path.slice(1).replace(/\//g, '\\') : path
    } catch {
        return fileUrl
    }
}

function toAssetUrl(filePath) {
    try {
        return convertFileSrc(filePath)
    } catch {
        // Fall back for browser-only Vite previews.
    }

    return toFileUrl(filePath) || filePath
}

export function resolveImageSource(value) {
    if (typeof value !== 'string') {
        return ''
    }

    const src = value.trim()
    if (!src) {
        return ''
    }

    if (
        /^(data:|blob:|https?:|asset:)/i.test(src)
        // ||
        // src.startsWith('/assets/') ||
        // src.startsWith('./assets/') ||
        // src.startsWith('../assets/')
    ) {
        return src
    }

    if (/^file:/i.test(src)) {
        return toAssetUrl(fromFileUrl(src))
    }

    if (/^[A-Za-z]:[\\/]/.test(src) || /^\\\\/.test(src) || src.startsWith('/')) {
        return toAssetUrl(src)
    }

    return src
}

export function getBaseName(filePath, fallback = 'Unknown Title') {
    if (!filePath) return fallback

    const segments = String(filePath).split(/\\|\//)
    return segments[segments.length - 1] || fallback
}
