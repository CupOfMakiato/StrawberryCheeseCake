import { createElement, Play, Shuffle, Ellipsis, PencilLine } from 'lucide'
import placeholder from '../../assets/music-placeholder.png'
import { resolveImageSource } from '../../utils/file-path.js'
import {
    normalizeTrackRecord,
    DEFAULT_TRACK_TITLE,
    DEFAULT_TRACK_ARTIST,
} from '../../utils/track-record.js'
import { resolveTrackImage } from '../../utils/playlist-media.js'
import { formatDate } from '../../utils/date.js'
import { formatDurationClock } from '../../utils/duration.js'

// Scoped playlist styles
// MusicHub playlist.css as scoped utilities; keep its original colors.
const styles = {
    '.playlistPage':
        "p-4 font-['Rubik_Reference',sans-serif] text-[16px] leading-[normal] text-black selection:bg-[#dbeafe] [&_button]:font-[Arial,sans-serif] [&_button]:text-[13.333px] [&_button]:font-normal [&_button]:leading-[normal] [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-[#5b8cff] [&_button]:focus-visible:outline-offset-2 motion-reduce:[&_*]:transition-none",
    '.playlistHeader': 'overflow-hidden rounded-[12px] border border-[#d8dee8] bg-white',
    '.playlistHeaderBody':
        'grid grid-cols-[140px_minmax(0,1fr)] gap-[14px] p-[14px] [@media(max-width:780px)]:grid-cols-1',
    '.playlistImageButton':
        'group/image relative size-[140px] overflow-hidden rounded-[10px] border-0 bg-[#edf2f7] p-0 [@media(max-width:780px)]:h-[180px] [@media(max-width:780px)]:w-full [@media(max-width:780px)]:max-w-[180px]',
    '.playlistImage':
        'block size-full rounded-[10px] object-cover transition-[filter,transform] duration-160 ease-[ease] group-hover/image:scale-[1.02] group-hover/image:brightness-80 group-focus-visible/image:scale-[1.02] group-focus-visible/image:brightness-80',
    '.playlistImageEditIcon':
        'pointer-events-none absolute right-2 bottom-2 inline-flex size-[34px] translate-y-1 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.72)] bg-[rgba(17,24,39,0.72)] text-white opacity-0 transition-[opacity,transform] duration-160 ease-[ease] group-hover/image:translate-y-0 group-hover/image:opacity-100 group-focus-visible/image:translate-y-0 group-focus-visible/image:opacity-100 [&_svg]:size-[17px]',
    '.playlistMetaLabel': 'm-0 text-[12px] text-[#667085] uppercase',
    '#playlistTitle':
        'my-1 inline-block max-w-full rounded-[6px] text-[24px] font-bold outline-2 outline-transparent outline-offset-[3px] [&.is-editable]:cursor-text [&.is-editable:hover]:cursor-(--cursor-pointer-clicked) [&.is-editable:focus-visible]:outline-[#2563eb] [&.is-editing]:bg-[#eff6ff] [&.is-editing]:outline-[#2563eb]',
    '#playlistSubtitle': 'm-0 text-[#475467]',
    '.playlistControls':
        'mt-3 flex items-center gap-2 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:overflow-hidden [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:leading-none [&_button]:text-[#1f2937] [&_button:hover]:bg-[#edf2f7] [&_svg]:size-4',
    '#playlistPlayBtn': 'relative size-10 [&_svg]:size-6!',
    '#playlistShuffleBtn': 'relative size-[34px]',
    '#playlistAdvanceOptionsBtn': 'relative size-[34px]',
    '.playlistTrackSection':
        'mt-[14px] overflow-visible rounded-[10px] border border-[#d8dee8] bg-white',
    '.playlistTrackTable':
        'w-full table-fixed border-collapse [&_th]:box-content [&_th]:border-b [&_th]:border-[#edf1f5] [&_th]:p-2.5 [&_th]:text-center [&_th]:text-[13px] [&_th]:font-bold [&_th:first-child]:w-14 [&_th:last-child]:w-12 [&_th:nth-child(2)]:text-left [&_thead]:bg-[#f8fafc] [&_th_p]:mt-0.5 [&_th_p]:mb-[1em] [&_th_p]:text-[small] [&_th_p]:font-normal [&_th_p]:opacity-50',
    '.playlistEmptyRow': 'h-15 px-[5px] text-center text-[13px] text-[#64748b]',
    '.playlistTrackIndexCell': 'w-14',
    '.playlistTrackIndexPlayBtn':
        'relative inline-flex size-[30px] items-center justify-center overflow-hidden rounded-lg border-0 bg-transparent p-0 leading-none text-[#1f2937] hover:bg-[#edf2f7] focus-visible:outline-2 focus-visible:outline-[#5b8cff]',
    '.playlistTrackIndexValue':
        'pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-140 ease-[ease] group-hover/row:opacity-0 group-focus-within/row:opacity-0',
    '.playlistTrackIndexPlayIcon':
        'pointer-events-none absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-140 ease-[ease] group-hover/row:opacity-100 group-focus-within/row:opacity-100 [&_svg]:block [&_svg]:size-full',
    '.playlistTrackTitleCell': 'text-left!',
    '.playlistTrackTitleWrap': 'flex min-w-0 items-center gap-2.5',
    '.playlistTrackCover': 'size-[38px] max-w-none shrink-0 rounded-lg bg-[#edf2f7] object-cover',
    '.playlistTrackTitleText': 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
    '.playlistTrackActionsCell': 'relative z-2 w-12 overflow-visible! [&.is-menu-open]:z-120',
    '.playlistTrackActions':
        'relative z-22 flex items-center justify-center [&.is-menu-open]:z-100',
    '.playlistTrackMoreBtn':
        'pointer-events-none inline-flex size-[34px] items-center justify-center rounded-lg border border-[#d6dbe3] bg-white p-0 opacity-0 transition-[opacity,background] duration-140 ease-[ease] hover:bg-[#f5f7fa] group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [[class~="is-menu-open"]_&]:pointer-events-auto [[class~="is-menu-open"]_&]:opacity-100',
    '.playlistTrackMenu':
        'absolute top-[38px] right-0 z-100 hidden min-w-[190px] rounded-lg border border-[#d9dee7] bg-white p-[6px] shadow-[0_8px_18px_rgba(23,31,56,0.12)] [&.is-open]:z-110 [&.is-open]:grid [&.is-open]:gap-[6px]',
    '.removeTrackBtn':
        'rounded-[2px] border-2 [border-style:outset] border-[#767676] bg-[#efefef] px-[6px] py-px text-black hover:bg-[#e5e5e5]',
}

export const trackRowClasses =
    'group/row relative z-1 h-15 cursor-(--cursor-grab) [&_td]:box-border [&_td]:h-15 [&_td]:overflow-hidden [&_td]:border-b [&_td]:border-[#edf1f5] [&_td]:px-[5px] [&_td]:py-0 [&_td]:text-center [&_td]:text-[13px] [&.is-menu-open]:z-90 [&.isNowPlaying_td]:bg-[#f5f9fe] [&.isNowPlaying_td]:shadow-[inset_0_2px_0_#5b8cff,inset_0_-2px_0_#5b8cff] [&.isNowPlaying_td:first-child]:shadow-[inset_2px_0_0_#5b8cff,inset_0_2px_0_#5b8cff,inset_0_-2px_0_#5b8cff] [&.isNowPlaying_td:last-child]:shadow-[inset_-2px_0_0_#5b8cff,inset_0_2px_0_#5b8cff,inset_0_-2px_0_#5b8cff] [&.sortable-chosen]:cursor-(--cursor-grabbing) [&.sortable-drag]:cursor-(--cursor-grabbing) [&.playlistTrackRow--fallbackDragging]:cursor-(--cursor-grabbing)'

export function applyPlaylistStyles(root) {
    for (const [selector, classes] of Object.entries(styles)) {
        const targets = root.matches(selector) ? [root] : root.querySelectorAll(selector)
        targets.forEach((element) => element.classList.add(...classes.split(' ')))
    }
}

// Shared DOM helpers
export const DEFAULT_PLAYLIST_IMAGE = placeholder
export const cursorClasses = { grabbing: 'cursor-grabbing' }
export function getDataAttributeIndex(element, attributeName) {
    const value = element?.getAttribute(attributeName)
    if (value === null || value === undefined || value.trim() === '') return null
    const index = Number(value)
    return Number.isInteger(index) && index >= 0 ? index : null
}
export function bindImageFallback(image, fallback = placeholder) {
    if (!image) return
    delete image.dataset.fallbackApplied
    image.onerror = () => {
        if (image.dataset.fallbackApplied) {
            image.onerror = null
            return
        }
        image.dataset.fallbackApplied = 'true'
        image.src = fallback
    }
}
export function bindImageFallbacks({ scope, selector = 'img' }) {
    scope?.querySelectorAll(selector).forEach((image) => bindImageFallback(image))
}
const icons = { play: Play, shuffle: Shuffle, ellipsis: Ellipsis, 'pencil-line': PencilLine }
export function createIcons({ nodes }) {
    nodes.forEach((node) => {
        const targets = node.matches('[data-lucide]')
            ? [node]
            : node.querySelectorAll('[data-lucide]')
        targets.forEach((target) => {
            const icon = icons[target.getAttribute('data-lucide')]
            if (!icon) return
            const svg = createElement(icon)
            for (const attribute of target.attributes)
                svg.setAttribute(attribute.name, attribute.value)
            svg.setAttribute('aria-hidden', 'true')
            target.replaceWith(svg)
        })
    })
}

// Loading skeleton
// MusicHub's Playlist skeleton and 1.2s shimmer, kept local to this route.
export function createPlaylistLoading(root) {
    let overlay = null
    const animations = []
    const block = (classes) =>
        `<div class="playlistSkeletonBlock rounded bg-[linear-gradient(90deg,#e6eef8_25%,#f5f7fb_50%,#e6eef8_75%)] bg-size-[200%_100%] ${classes}"></div>`
    function hide() {
        if (!overlay) return
        const current = overlay
        overlay = null
        animations.splice(0).forEach((animation) => animation.cancel())
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            current.remove()
            return
        }
        const fade = current.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 300,
            easing: 'ease',
        })
        fade.onfinish = () => current.remove()
    }
    function show() {
        if (overlay) return
        overlay = document.createElement('div')
        overlay.className =
            'pointer-events-none absolute inset-0 z-200 overflow-hidden bg-[rgba(255,255,255,0.85)] p-4'
        overlay.setAttribute('aria-hidden', 'true')
        const rows = Array.from(
            { length: 8 },
            () =>
                `<tr class="h-15 [&_td]:h-15 [&_td]:border-b [&_td]:border-[#edf1f5] [&_td]:px-[5px] [&_td]:py-0"><td>${block('mx-auto h-[13px] w-6')}</td><td><div class="flex items-center gap-2.5">${block('size-[38px] shrink-0 rounded-lg')}${block('h-[13px] w-3/5 max-w-[240px]')}</div></td>${Array.from({ length: 3 }, () => `<td>${block('mx-auto h-[13px] w-[70%] max-w-[140px]')}</td>`).join('')}<td>${block('mx-auto h-[13px] w-12')}</td><td>${block('mx-auto size-[34px] rounded-lg')}</td></tr>`,
        ).join('')
        const heading = [24, 48, 48, 48, 78, 58, 0]
            .map(
                (width, index) =>
                    `<th class="p-2.5 ${index === 0 ? 'w-[76px]' : index === 6 ? 'w-[68px]' : ''}">${width ? block(`h-[13px] ${index === 1 ? '' : 'mx-auto'}`) : ''}${index === 4 ? block('mx-auto mt-0.5 h-3 w-16') : ''}</th>`,
            )
            .join('')
        overlay.innerHTML = `<div class="overflow-hidden rounded-[12px] border border-[#d8dee8] bg-white"><div class="grid grid-cols-[140px_minmax(0,1fr)] gap-[14px] p-[14px] [@media(max-width:780px)]:grid-cols-1">${block('size-[140px] rounded-[10px] [@media(max-width:780px)]:h-[180px] [@media(max-width:780px)]:w-full [@media(max-width:780px)]:max-w-[180px]')}<div class="flex flex-col justify-center gap-[6px]">${block('h-3 w-[90px]')}${block('h-5 w-3/5')}${block('h-3 w-[45%]')}</div></div></div><div class="mt-3 flex items-center gap-2">${block('size-10 rounded-[6px]')}${block('size-[34px] rounded-[6px]')}${block('size-[34px] rounded-[6px]')}</div><div class="mt-[14px] rounded-[10px] border border-[#d8dee8] bg-white"><table class="w-full table-fixed border-collapse text-[13px]"><thead class="bg-[#f8fafc]"><tr>${heading}</tr></thead><tbody>${rows}</tbody></table></div>`
        overlay.querySelectorAll('thead th').forEach((cell, index) => {
            const line = cell.firstElementChild
            if (line) line.style.width = [24, 48, 48, 48, 78, 58][index] + 'px'
        })
        root.appendChild(overlay)
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            overlay.querySelectorAll('.playlistSkeletonBlock').forEach((element) => {
                animations.push(
                    element.animate(
                        [{ backgroundPosition: '-200% 0' }, { backgroundPosition: '200% 0' }],
                        { duration: 1200, iterations: Infinity, easing: 'linear' },
                    ),
                )
            })
        }
    }
    function cleanup() {
        animations.splice(0).forEach((animation) => animation.cancel())
        overlay?.remove()
        root.querySelectorAll('[aria-hidden="true"].z-200').forEach((element) => element.remove())
        overlay = null
    }
    return { show, hide, cleanup }
}

// Track row renderer
//converting track data to HTML for rendering in playlist table rows


export function renderTrackRow({
    index,
    track,
    normalizedTrack: preparedTrack,
    duration,
    rowHeight,
} = {}) {
    const normalizedTrack = preparedTrack || normalizeTrackRecord(track)
    const trackTitle = normalizedTrack?.title || DEFAULT_TRACK_TITLE
    const artist = normalizedTrack?.artist || DEFAULT_TRACK_ARTIST
    const album = normalizedTrack?.album || 'Unknown Album'
    const trackImage = resolveTrackImage(normalizedTrack) || DEFAULT_PLAYLIST_IMAGE
    const dateAdded = formatDate(normalizedTrack?.playedAt || normalizedTrack?.addedAt)

    const dur = typeof duration === 'number' && duration > 0 ? duration : null

    const tr = document.createElement('tr')
    tr.className = 'playlistTrackRow ' + trackRowClasses
    tr.setAttribute('data-track-id', normalizedTrack?.filePath || '')
    tr.setAttribute('data-track-index', String(index))
    if (typeof rowHeight === 'number') {
        tr.style.height = `${rowHeight}px`
    }

    const tdIndex = document.createElement('td')
    tdIndex.className = 'playlistTrackIndexCell'
    const playBtn = document.createElement('button')
    playBtn.type = 'button'
    playBtn.className = 'playlistTrackIndexPlayBtn'
    playBtn.setAttribute('data-track-index', String(index))
    playBtn.setAttribute('aria-label', `Play from track ${index + 1}`)
    const spanIndex = document.createElement('span')
    spanIndex.className = 'playlistTrackIndexValue'
    spanIndex.textContent = String(index + 1)
    const playIcon = document.createElement('i')
    playIcon.setAttribute('data-lucide', 'play')
    playIcon.className = 'playlistTrackIndexPlayIcon'
    playIcon.setAttribute('aria-hidden', 'true')
    playBtn.appendChild(spanIndex)
    playBtn.appendChild(playIcon)
    tdIndex.appendChild(playBtn)
    tr.appendChild(tdIndex)

    const tdTitle = document.createElement('td')
    tdTitle.className = 'playlistTrackTitleCell'
    const wrap = document.createElement('div')
    wrap.className = 'playlistTrackTitleWrap'
    const img = document.createElement('img')
    img.className = 'playlistTrackCover'
    img.src = resolveImageSource(trackImage) || DEFAULT_PLAYLIST_IMAGE
    img.alt = 'Track cover'
    img.setAttribute('draggable', 'false')
    const spanTitle = document.createElement('span')
    spanTitle.className = 'playlistTrackTitleText'
    spanTitle.textContent = trackTitle
    wrap.appendChild(img)
    wrap.appendChild(spanTitle)
    tdTitle.appendChild(wrap)
    tr.appendChild(tdTitle)

    const tdArtist = document.createElement('td')
    tdArtist.textContent = artist
    tr.appendChild(tdArtist)

    const tdAlbum = document.createElement('td')
    tdAlbum.textContent = album
    tr.appendChild(tdAlbum)

    const tdDate = document.createElement('td')
    tdDate.textContent = dateAdded
    tr.appendChild(tdDate)

    const tdDuration = document.createElement('td')
    tdDuration.setAttribute('data-duration-index', String(index))
    tdDuration.textContent = formatDurationClock(dur)
    tr.appendChild(tdDuration)

    const tdActions = document.createElement('td')
    tdActions.className = 'playlistTrackActionsCell'
    const actionsDiv = document.createElement('div')
    actionsDiv.className = 'playlistTrackActions'
    const moreBtn = document.createElement('button')
    moreBtn.type = 'button'
    moreBtn.className = 'playlistTrackMoreBtn'
    moreBtn.setAttribute('data-track-index', String(index))
    moreBtn.setAttribute('aria-label', 'Track actions')
    const moreIcon = document.createElement('i')
    // option icon
    moreIcon.setAttribute('data-lucide', 'ellipsis')
    moreBtn.appendChild(moreIcon)
    const menuDiv = document.createElement('div')
    menuDiv.className = 'playlistTrackMenu'
    menuDiv.setAttribute('data-track-index', String(index))
    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.className = 'removeTrackBtn'
    removeBtn.setAttribute('data-track-index', String(index))
    removeBtn.textContent = 'Remove from Playlist'
    menuDiv.appendChild(removeBtn)
    actionsDiv.appendChild(moreBtn)
    actionsDiv.appendChild(menuDiv)
    tdActions.appendChild(actionsDiv)
    tr.appendChild(tdActions)

    applyPlaylistStyles(tr)
    return tr
}

// Virtualization
let virtualCorePromise = null
let virtualCore = null

export async function loadPlaylistVirtualCore() {
    if (virtualCore) {
        return virtualCore
    }

    virtualCorePromise ||= import('@tanstack/virtual-core')
    virtualCore = await virtualCorePromise

    return virtualCore
}

export function canUsePlaylistVirtualizer() {
    return typeof virtualCore?.Virtualizer === 'function'
}

export function createPlaylistVirtualizer(options) {
    if (!canUsePlaylistVirtualizer()) {
        return null
    }

    const virtualizer = new virtualCore.Virtualizer({
        scrollToFn: virtualCore.elementScroll,
        observeElementRect: virtualCore.observeElementRect,
        observeElementOffset: virtualCore.observeElementOffset,
        useScrollendEvent: true,
        useAnimationFrameWithResizeObserver: true,
        ...options,
    })

    virtualizer._willUpdate()
    const cleanup = virtualizer._didMount()
    virtualizer.destroy = cleanup

    return virtualizer
}

// Scroll controller
export function createPlaylistScrollController({
    trackContainer,
    image,
    getVirtualizer,
    onRender,
} = {}) {
    let cachedScrollMargin = null
    let playlistLayoutResizeObserver = null
    let scrollRaf = null

    function getScrollElement() {
        return trackContainer.closest('.appShell')
    }

    function getScrollTop() {
        const scrollElement = getScrollElement()
        if (scrollElement === window) {
            return (document.scrollingElement || document.documentElement).scrollTop
        }

        return scrollElement.scrollTop
    }

    function getViewportHeight() {
        const scrollElement = getScrollElement()
        if (scrollElement === window) {
            return window.innerHeight || document.documentElement.clientHeight
        }

        return scrollElement.clientHeight
    }

    function getElementTopWithinAppScroll(element) {
        const scrollElement = getScrollElement()
        const scrollTop = getScrollTop()
        const elementRect = element.getBoundingClientRect()

        if (scrollElement === window) {
            return elementRect.top + scrollTop
        }

        const scrollRect = scrollElement.getBoundingClientRect()
        return elementRect.top - scrollRect.top + scrollTop
    }

    function getScrollMargin({ force = false } = {}) {
        if (!force && cachedScrollMargin !== null) {
            return cachedScrollMargin
        }

        const table = trackContainer.querySelector('.playlistTrackTable')
        const thead = table?.querySelector('thead')
        const headerHeight = thead ? thead.getBoundingClientRect().height : 0

        cachedScrollMargin = getElementTopWithinAppScroll(trackContainer) + headerHeight
        return cachedScrollMargin
    }

    function scheduleRender() {
        if (scrollRaf) {
            return
        }

        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = null
            onRender?.()
        })
    }

    function invalidate() {
        cachedScrollMargin = null
        if (getVirtualizer?.()) {
            scheduleRender()
        }
    }

    function observe() {
        if (typeof ResizeObserver === 'function') {
            playlistLayoutResizeObserver = new ResizeObserver(invalidate)
            ;[
                document.querySelector('.playlistHeader'),
                document.querySelector('.playlistControls'),
                trackContainer.querySelector('thead'),
            ].forEach((element) => {
                if (element) {
                    playlistLayoutResizeObserver.observe(element)
                }
            })
        }

        window.addEventListener('resize', invalidate, { passive: true })
        image.addEventListener('load', invalidate)
        image.addEventListener('error', invalidate)
    }

    function cleanup() {
        if (scrollRaf) {
            cancelAnimationFrame(scrollRaf)
            scrollRaf = null
        }

        window.removeEventListener('resize', invalidate)
        image.removeEventListener('load', invalidate)
        image.removeEventListener('error', invalidate)
        playlistLayoutResizeObserver?.disconnect()
        playlistLayoutResizeObserver = null
        cachedScrollMargin = null
    }

    return {
        getScrollElement,
        getScrollTop,
        getViewportHeight,
        getScrollMargin,
        scheduleRender,
        observe,
        invalidate,
        cleanup,
    }
}
