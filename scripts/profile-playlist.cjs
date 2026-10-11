// Hidden Electron benchmark; uses synthetic metadata latency, no native audio files.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const phase = process.argv.includes('--after') ? 'after' : 'before'
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'playlist-profile-')))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})

async function profile() {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const frame = () => new Promise(requestAnimationFrame)
    const until = async (predicate) => {
        for (let i = 0; i < 200; i++) {
            if (predicate()) return
            await wait(20)
        }
        throw Error('Playlist profile timed out')
    }
    const { sessionService } = await import('/src/services/session-service.js')
    const { playerState } = await import('/src/utils/player-state.js')
    const { audioService } = await import('/src/services/audio-service.js')
    const image = (await import('/src/assets/music-placeholder.png?import')).default
    const shell = document.querySelector('.appShell')
    let calls = 0,
        pending = 0,
        peak = 0
    audioService.resolveTrackMetadata = async () => {
        calls++
        pending++
        peak = Math.max(peak, pending)
        await wait(120)
        pending--
        return { image }
    }
    const seed = async (count, covers, name) => {
        shell.scrollTop = 0
        const tracks = Array.from({ length: count }, (_, i) => ({
            filePath: `D:/Synthetic/${name}-${i}.mp3`,
            title: `Track ${i}`,
            artist: 'Artist',
            album: 'Album',
            duration: 180,
            image: covers ? image : null,
            addedAt: '2026-10-01T00:00:00Z',
        }))
        const start = performance.now()
        await sessionService.saveUserPlaylists([
            { id: 'playlist-test', name, cover: image, tracks },
        ])
        await until(
            () =>
                document.querySelector('#playlistTitle')?.textContent === name &&
                !document.querySelector('main[aria-busy]'),
        )
        const readyMs = performance.now() - start
        await wait(500)
        return { tracks, readyMs }
    }
    const scrolling = []
    for (let run = 0; run < 3; run++) {
        const { tracks, readyMs } = await seed(5000, true, `cached-${run}`)
        playerState.setPlaylist(tracks.map((t) => t.filePath))
        playerState.setCurrentTrackIndex(4999)
        let mutations = 0
        const observer = new MutationObserver((records) => {
            mutations += records.length
        })
        observer.observe(document.querySelector('#playlistTrackBody'), {
            subtree: true,
            attributes: true,
            childList: true,
            characterData: true,
        })
        const frames = []
        let last = await frame()
        for (let i = 1; i <= 120; i++) {
            shell.scrollTop = i * 300
            const now = await frame()
            frames.push(now - last)
            last = now
        }
        await wait(80)
        observer.disconnect()
        frames.sort((a, b) => a - b)
        const body = document.querySelector('#playlistTrackBody')
        let progressMutations = 0
        const progressObserver = new MutationObserver((r) => {
            progressMutations += r.length
        })
        progressObserver.observe(body, { subtree: true, attributes: true, childList: true })
        const start = performance.now()
        for (let i = 0; i < 200; i++) playerState.setProgress({ currentTime: i })
        const progressMs = performance.now() - start
        await wait(20)
        progressObserver.disconnect()
        scrolling.push({
            readyMs,
            mutations,
            progressMutations,
            progressMs,
            frameMedianMs: frames[60],
            frameP95Ms: frames[114],
            mountedRows: body.querySelectorAll('.playlistTrackRow').length,
            trackHeight: body.getBoundingClientRect().height,
        })
    }
    await seed(1000, false, 'missing-covers')
    for (let i = 1; i <= 40; i++) {
        shell.scrollTop = i * 600
        await frame()
    }
    await wait(500)
    const hydration = { calls, peakPending: peak }
    // Leaving the route while reads are pending must stop the pending queue.
    await seed(1000, false, 'cancel-covers')
    shell.scrollTop = 48000
    await wait(30)
    history.pushState({}, '', '/library')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await wait(50)
    const callsAtExit = calls
    await wait(400)
    hydration.callsAfterExit = calls - callsAtExit
    return { scrolling, hydration }
}

app.whenReady()
    .then(async () => {
        const win = new BrowserWindow({
            width: 1000,
            height: 800,
            show: false,
            webPreferences: { offscreen: true, backgroundThrottling: false },
        })
        await win.loadURL('http://localhost:1422/playlist/playlist-test')
        const result = await win.webContents.executeJavaScript(`(${profile.toString()})()`)
        fs.mkdirSync('.impeccable/review', { recursive: true })
        fs.writeFileSync(
            `.impeccable/review/playlist-profile-${phase}.json`,
            JSON.stringify(result, null, 2),
        )
        console.log(JSON.stringify(result, null, 2))
        win.destroy()
        app.quit()
    })
    .catch((error) => {
        console.error(error)
        app.exit(1)
    })
