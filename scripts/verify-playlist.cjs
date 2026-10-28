// Run with the reference Electron executable; it is a test tool, not an app dependency.
// Example: electron.exe --no-sandbox scripts/verify-playlist.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'playlist-verification-')))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})

async function verify() {
    const checks = []
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const expect = (condition, label) => {
        if (!condition) throw Error(label)
        checks.push(label)
    }
    const until = async (predicate) => {
        for (let i = 0; i < 100; i++) {
            if (predicate()) return
            await wait(30)
        }
        throw Error('Wait timed out after ' + checks.at(-1))
    }
    const { sessionService } = await import('/src/services/session-service.js')
    const { audioService } = await import('/src/services/audio-service.js')
    const { playerState } = await import('/src/utils/player-state.js')
    const { selectPlaylistImage } = await import('/src/services/playlist-media-service.js')
    const image = (await import('/src/assets/music-placeholder.png?import')).default
    const key = 'strawberry-cheesecake:user-playlists'
    const stored = () => JSON.parse(localStorage.getItem(key))[0]
    const body = () => document.querySelector('#playlistTrackBody')
    const rows = () => [...body().querySelectorAll('.playlistTrackRow')]
    const row = (index) => rows().find((row) => Number(row.dataset.trackIndex) === index)
    const sortable = () => body()[Object.keys(body()).find((key) => key.startsWith('Sortable'))]
    const tracks = (count) =>
        Array.from({ length: count }, (_, i) => ({
            filePath: `D:/Synthetic/${i}.mp3`,
            title: `Track ${i}`,
            artist: 'Artist',
            album: 'Album',
            image,
            duration: 180,
            addedAt: '2026-10-01T00:00:00Z',
        }))
    const seed = async (count) => {
        document.querySelector('.appShell').scrollTop = 0
        await sessionService.saveUserPlaylists([
            { id: 'playlist-test', name: `Playlist ${count}`, cover: image, tracks: tracks(count) },
        ])
        await until(
            () =>
                document.querySelector('#playlistTitle')?.textContent === `Playlist ${count}` &&
                !document.querySelector('main[aria-busy]'),
        )
        await wait(80)
    }
    let played
    audioService.startPlaylist = (paths) => {
        played = paths
    }
    audioService.resolveTrackMetadata = async () => ({})
    await until(() => body())
    await seed(10)
    expect(rows().length === 10, 'Small playlist mounts all tracks')
    expect(
        document.querySelectorAll('.playlistTrackTable thead th').length === 7,
        'Seven reference columns including duration',
    )
    expect(
        document.querySelector('#playlistDuration').textContent === ', 30 min 0 sec',
        'Header duration matches source formatting',
    )
    expect(
        document.querySelector('#playlistShuffleBtn svg') &&
            document.querySelector('#playlistAdvanceOptionsBtn svg'),
        'All reference control icons are present',
    )
    expect(
        rows().every((row) => row.getBoundingClientRect().height === 60),
        'Track rows measure 60px',
    )
    expect(
        document.querySelector('.playlistImageButton').getBoundingClientRect().width === 140,
        'Desktop artwork measures 140px',
    )
    document.querySelector('#playlistPlayBtn').click()
    expect(
        played.length === 10 && played[0] === 'D:/Synthetic/0.mp3',
        'Play all dispatches the complete ordered queue',
    )
    row(4).querySelector('.playlistTrackIndexPlayBtn').click()
    expect(
        played.length === 6 && played[0] === 'D:/Synthetic/4.mp3',
        'Row playback starts at the selected track',
    )
    playerState.setPlaylist(tracks(10).map((track) => track.filePath))
    playerState.setCurrentTrackIndex(4)
    expect(
        row(4).getAttribute('aria-current') === 'true',
        'Playing highlight attaches to the selected file',
    )
    const move = async (sourceIndex, targetIndex, after) => {
        const source = row(sourceIndex),
            target = row(targetIndex),
            instance = sortable()
        if (!source || !target) throw Error('Missing drag fixture rows')
        instance.options.onStart({ item: source })
        instance.options.onMove({ related: target, willInsertAfter: after })
        body().insertBefore(source, after ? target.nextSibling : target)
        instance.options.onEnd({ item: source })
        await wait(100)
    }
    const identity = row(4)
    await move(4, 0, false)
    expect(
        stored().tracks[0].filePath === 'D:/Synthetic/4.mp3',
        'Moving a playing track persists its new position',
    )
    expect(
        row(0) === identity && row(0).getAttribute('aria-current') === 'true',
        'Reorder preserves DOM identity and playback highlight',
    )
    expect(
        row(0).querySelector('.playlistTrackIndexValue').textContent === '1',
        'Track numbers update after reorder',
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    await wait(100)
    expect(
        stored().tracks[4].filePath === 'D:/Synthetic/4.mp3',
        'Ctrl+Z restores the previous order',
    )
    const title = document.querySelector('#playlistTitle')
    title.click()
    title.textContent = 'Renamed'
    title.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await wait(100)
    expect(stored().name === 'Renamed', 'Inline title editing persists on Enter')
    title.click()
    title.textContent = 'Cancelled'
    title.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(
        title.textContent === 'Renamed' && stored().name === 'Renamed',
        'Escape cancels title editing',
    )
    row(3).querySelector('.playlistTrackMoreBtn').click()
    expect(
        row(3).querySelector('.playlistTrackMenu').classList.contains('is-open'),
        'Reference track menu opens',
    )
    row(3).querySelector('.removeTrackBtn').click()
    await wait(100)
    expect(
        stored().tracks.length === 9 &&
            !stored().tracks.some((track) => track.filePath === 'D:/Synthetic/3.mp3'),
        'Remove action persists the correct file',
    )

    for (const count of [100, 500, 1000]) {
        await seed(count)
        expect(
            rows().length > 0 && rows().length < 50,
            `${count} tracks mount only visible and overscan rows`,
        )
        const total = body().getBoundingClientRect().height
        expect(
            Math.abs(total - count * 60) < 1,
            `${count} tracks preserve the full virtual height (measured ${total})`,
        )
        document.querySelector('.appShell').scrollTop = count * 30
        await wait(150)
        expect(
            rows().length < 50 && Number(rows()[0].dataset.trackIndex) > 0,
            `${count} tracks scroll to the correct virtual range`,
        )
        const first = Number(rows()[2].dataset.trackIndex),
            second = Number(rows()[3].dataset.trackIndex)
        await move(second, first, false)
        expect(
            stored().tracks[first].filePath === `D:/Synthetic/${second}.mp3`,
            `${count} tracks reorder using global scrolled indexes`,
        )
    }
    await seed(1000)
    const source = row(0),
        instance = sortable()
    instance.options.onStart({ item: source })
    document.querySelector('.appShell').scrollTop = 42000
    await wait(150)
    expect(
        source.isConnected && rows().length < 50,
        'Source row survives a long drag without mounting all tracks',
    )
    const target = row(700)
    instance.options.onMove({ related: target, willInsertAfter: true })
    body().insertBefore(source, target.nextSibling)
    instance.options.onEnd({ item: source })
    await wait(150)
    expect(
        stored().tracks[700].filePath === 'D:/Synthetic/0.mp3',
        'First track moves across 700 virtual positions',
    )
    expect(
        new Set(stored().tracks.map((track) => track.filePath)).size === 1000,
        'Long reorder preserves every unique file',
    )
    expect(
        stored().tracks[701].filePath === 'D:/Synthetic/701.mp3',
        'Long reorder preserves the surrounding order',
    )
    await seed(1000)
    const firstTrack = row(0),
        edgeInstance = sortable()
    edgeInstance.options.onStart({ item: firstTrack })
    document.querySelector('.appShell').scrollTop = 100000
    await wait(150)
    const lastTrack = row(999)
    edgeInstance.options.onMove({ related: lastTrack, willInsertAfter: true })
    body().appendChild(firstTrack)
    edgeInstance.options.onEnd({ item: firstTrack })
    await wait(150)
    expect(
        stored().tracks[999].filePath === 'D:/Synthetic/0.mp3',
        'First track moves to the final position in a 1000-track list',
    )
    const newLast = row(999)
    edgeInstance.options.onStart({ item: newLast })
    document.querySelector('.appShell').scrollTop = 0
    await wait(150)
    const newFirst = row(0)
    edgeInstance.options.onMove({ related: newFirst, willInsertAfter: false })
    body().insertBefore(newLast, newFirst)
    edgeInstance.options.onEnd({ item: newLast })
    await wait(150)
    expect(
        stored().tracks[0].filePath === 'D:/Synthetic/0.mp3',
        'Last track moves back to the first position in a 1000-track list',
    )

    await seed(10)
    const cancelSource = row(0),
        cancelInstance = sortable()
    cancelInstance.options.onStart({ item: cancelSource })
    body().appendChild(cancelSource)
    cancelInstance.options.onEnd({
        item: cancelSource,
        originalEvent: { clientX: -10, clientY: 400 },
    })
    await wait(100)
    expect(
        stored().tracks[0].filePath === 'D:/Synthetic/0.mp3' &&
            row(0).dataset.trackId === 'D:/Synthetic/0.mp3',
        'Outside drop restores the original order',
    )
    const save = sessionService.saveUserPlaylists
    sessionService.saveUserPlaylists = async () => false
    await move(0, 9, true)
    expect(
        stored().tracks[0].filePath === 'D:/Synthetic/0.mp3',
        'Failed reorder does not change persistent order',
    )
    expect(
        row(0).dataset.trackId === 'D:/Synthetic/0.mp3' &&
            document.querySelector('[role=alert]').textContent.includes('Failed'),
        'Failed reorder restores rows and displays an error',
    )
    sessionService.saveUserPlaylists = save
    await seed(0)
    expect(
        body().textContent.includes('No tracks in this playlist yet.'),
        'Empty state uses the source copy',
    )
    expect(rows().length === 0, 'Empty playlist unmounts virtual tracks')
    const native = window.__TAURI_INTERNALS__
    const calls = []
    window.__TAURI_INTERNALS__ = {
        ...native,
        invoke: async (command, args, options) => {
            calls.push({ command, args, options })
            if (command === 'plugin:dialog|open') return 'D:/Synthetic/cover.png'
            if (command === 'plugin:fs|read_file') return [1, 2, 3]
            if (command === 'plugin:path|resolve_directory') return 'D:/AppData/'
            if (command === 'plugin:path|join') return args.paths.join('/').replaceAll('//', '/')
        },
    }
    const banner = await selectPlaylistImage()
    expect(
        banner.startsWith('D:/AppData/artwork/playlist-') && banner.endsWith('.png'),
        'Artwork selection returns a durable AppData path',
    )
    expect(
        calls.some((call) => call.command === 'plugin:fs|write_file'),
        'Selected artwork is copied into the allowed artwork directory',
    )
    document.querySelector('#playlistImageEditBtn').click()
    await until(() => stored().banner)
    expect(
        stored().banner.startsWith('D:/AppData/artwork/playlist-'),
        'Header artwork editing persists the selected image',
    )
    window.__TAURI_INTERNALS__.invoke = async () => null
    expect((await selectPlaylistImage()) === '', 'Cancelling the artwork picker makes no change')
    // A valid silent WAV exercises the actual browser metadata probe, without playback.
    const wav = new Uint8Array(44 + 16000 * 2 * 2)
    const view = new DataView(wav.buffer)
    const tag = (offset, text) =>
        [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
    tag(0, 'RIFF')
    view.setUint32(4, wav.length - 8, true)
    tag(8, 'WAVE')
    tag(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, 16000, true)
    view.setUint32(28, 32000, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    tag(36, 'data')
    view.setUint32(40, wav.length - 44, true)
    let reads = 0,
        peakReads = 0
    window.__TAURI_INTERNALS__.invoke = async (command) => {
        if (command === 'plugin:fs|read_file') {
            reads++
            peakReads = Math.max(peakReads, reads)
            await wait(20)
            reads--
            return wav
        }
    }
    const durationTracks = Array.from({ length: 8 }, (_, index) => ({
        filePath: `D:/Duration/${index}.wav`,
        title: `Duration ${index}`,
        image,
    }))
    await sessionService.saveUserPlaylists([
        { id: 'playlist-test', name: 'Duration Test', cover: image, tracks: durationTracks },
    ])
    await until(() => document.querySelector('#playlistDuration').textContent === ', 0 min 16 sec')
    expect(peakReads === 4, 'Missing durations are resolved with four workers')
    await until(() =>
        rows().every((row) => row.querySelector('[data-duration-index]').textContent === '0:02'),
    )
    expect(
        rows().every((row) => row.querySelector('[data-duration-index]').textContent === '0:02'),
        'Browser audio probes update each row duration',
    )
    await wait(1000)
    expect(
        stored().tracks.every((track) => track.duration === 2),
        'Resolved durations persist through the batched cache save',
    )
    window.__TAURI_INTERNALS__ = native
    const { createPlaylistArtworkController } = await import('/src/components/playlist/artwork.js')
    const fixture = document.createElement('div')
    fixture.className = 'appShell'
    fixture.style.cssText = 'position:fixed;top:20px;left:0;width:300px;height:200px;overflow:auto'
    const artworkTracks = Array.from({ length: 7 }, (_, i) => ({ filePath: `D:/Artwork/${i}.mp3` }))
    const artworkPlaylist = { id: 'artwork-fixture', tracks: artworkTracks }
    const artworkRows = artworkTracks.map((_, i) => {
        const row = document.createElement('div')
        row.className = 'playlistTrackRow'
        row.dataset.trackIndex = i
        row.style.height = '60px'
        const cover = document.createElement('img')
        cover.className = 'playlistTrackCover'
        cover.src = image
        row.appendChild(cover)
        fixture.appendChild(row)
        return row
    })
    document.body.appendChild(fixture)
    fixture.scrollTop = 130
    const artworkReads = []
    const completions = []
    const artworkController = createPlaylistArtworkController({
        getActivePlaylist: () => artworkPlaylist,
        audioService: {
            resolveTrackMetadata: (filePath) => {
                artworkReads.push(filePath)
                return new Promise((resolve) =>
                    completions.push(() => resolve({ image: image + '#' + filePath })),
                )
            },
        },
    })
    artworkController.scheduleArtworkHydration(artworkRows)
    await until(() => artworkReads.length === 2)
    await wait(100)
    expect(artworkReads.length === 2, 'Artwork loading limits concurrent metadata reads to two')
    expect(
        artworkReads[0] === artworkTracks[2].filePath &&
            artworkReads[1] === artworkTracks[3].filePath,
        'Visible artwork loads before overscan covers',
    )
    // An offscreen cached row must be eligible when it re-enters the mounted range.
    artworkRows[0].remove()
    artworkController.scheduleArtworkHydration(artworkRows)
    ;[artworkPlaylist.tracks[2], artworkPlaylist.tracks[3]] = [
        artworkPlaylist.tracks[3],
        artworkPlaylist.tracks[2],
    ]
    artworkRows[2].dataset.trackIndex = 3
    artworkRows[3].dataset.trackIndex = 2
    completions.splice(0).forEach((complete) => complete())
    await until(() => artworkReads.length === 4)
    expect(
        artworkPlaylist.tracks[3].image?.endsWith('#D:/Artwork/2.mp3') &&
            artworkPlaylist.tracks[2].image?.endsWith('#D:/Artwork/3.mp3'),
        'In-flight artwork follows its file after reordering',
    )
    expect(
        !artworkReads.includes(artworkTracks[0].filePath),
        'Disconnected rows do not start metadata reads',
    )
    fixture.prepend(artworkRows[0])
    fixture.scrollTop = 0
    artworkController.scheduleArtworkHydration([artworkRows[0]])
    completions.splice(0).forEach((complete) => complete())
    await until(() => artworkReads.length === 6)
    expect(
        artworkReads.includes(artworkTracks[0].filePath),
        'Cached rows resume artwork loading when remounted',
    )
    artworkController.cancelArtworkHydration()
    const readsAtCancellation = artworkReads.length
    completions.splice(0).forEach((complete) => complete())
    await wait(100)
    expect(
        artworkReads.length === readsAtCancellation,
        'Cancellation prevents queued artwork reads',
    )
    expect(!artworkPlaylist.tracks[0].image, 'Cancelled artwork results do not update the playlist')
    fixture.remove()
    return checks
}

async function verifyInput(win, checks) {
    const wc = win.webContents
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const expect = (condition, label) => {
        if (!condition) throw Error(label)
        checks.push(label)
    }
    async function seed(count) {
        await wc.executeJavaScript(`(async()=>{
            const {sessionService}=await import('/src/services/session-service.js');
            const image=(await import('/src/assets/music-placeholder.png?import')).default;
            document.querySelector('.appShell').scrollTop=0;
            await sessionService.saveUserPlaylists([{id:'playlist-test',name:'Pointer Test',cover:image,tracks:Array.from({length:${count}},(_,i)=>({filePath:'D:/Pointer/'+i+'.mp3',title:'Pointer '+i,artist:'Artist',album:'Album',image,duration:180}))}]);
        })()`)
        await wait(400)
    }
    const point = (index) =>
        wc.executeJavaScript(
            `(()=>{const r=document.querySelector('.playlistTrackRow[data-track-index="${index}"]').getBoundingClientRect();return {x:Math.round(r.x+300),y:Math.round(r.y+r.height/2)}})()`,
        )
    async function begin(index) {
        const p = await point(index)
        wc.sendInputEvent({ type: 'mouseMove', ...p })
        wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...p })
        wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y + 12, modifiers: ['leftButtonDown'] })
        await wait(100)
        return p
    }
    async function move(from, to) {
        for (let step = 1; step <= 12; step++) {
            wc.sendInputEvent({
                type: 'mouseMove',
                x: Math.round(from.x + ((to.x - from.x) * step) / 12),
                y: Math.round(from.y + ((to.y - from.y) * step) / 12),
                modifiers: ['leftButtonDown'],
            })
            await wait(25)
        }
        await wait(180)
    }
    const order = () =>
        wc.executeJavaScript(
            `JSON.parse(localStorage.getItem('strawberry-cheesecake:user-playlists'))[0].tracks.map(t=>t.filePath)`,
        )
    await seed(10)
    const start = await begin(0)
    expect(
        await wc.executeJavaScript(
            `!!document.querySelector('.playlistTrackRow--fallbackDragging')`,
        ),
        'Native pointer drag creates the reference fallback clone',
    )
    const end = await point(2)
    await move(start, { ...end, y: end.y + 20 })
    wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: end.x, y: end.y + 20 })
    await wait(200)
    expect(
        (await order())[2] === 'D:/Pointer/0.mp3',
        'Native pointer drag persists a downward move',
    )
    await seed(10)
    const cancel = await begin(0)
    await move(cancel, await point(2))
    await wc.executeJavaScript(
        `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
    )
    wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...cancel })
    await wait(150)
    expect((await order())[0] === 'D:/Pointer/0.mp3', 'Escape cancels a native pointer drag')
    expect(
        await wc.executeJavaScript(
            `!document.querySelector('.playlistTrackRow--fallbackDragging') && !document.documentElement.classList.contains('cursor-grabbing')`,
        ),
        'Cancellation clears the fallback clone and grabbing cursor',
    )
    await seed(1000)
    const longStart = await begin(0)
    const edge = await wc.executeJavaScript(
        `(()=>{const r=document.querySelector('.appShell').getBoundingClientRect();return {x:300,y:Math.round(r.bottom-5)}})()`,
    )
    await move(longStart, edge)
    const before = await wc.executeJavaScript(`document.querySelector('.appShell').scrollTop`)
    await wait(1300)
    const after = await wc.executeJavaScript(`document.querySelector('.appShell').scrollTop`)
    expect(after > before, 'Native drag AutoScroll advances the app scroll container')
    await wc.executeJavaScript(`document.querySelector('.appShell').scrollTop=42000`)
    await wait(200)
    expect(
        await wc.executeJavaScript(
            `!!document.querySelector('.playlistTrackRow[data-track-id="D:/Pointer/0.mp3"]') && document.querySelectorAll('.playlistTrackRow').length<50`,
        ),
        'Native long drag retains its source while virtualizing distant tracks',
    )
    const longEnd = await point(700)
    await move(edge, { ...longEnd, y: longEnd.y + 20 })
    wc.sendInputEvent({
        type: 'mouseUp',
        button: 'left',
        clickCount: 1,
        x: longEnd.x,
        y: longEnd.y + 20,
    })
    await wait(200)
    const saved = await order()
    expect(
        saved.indexOf('D:/Pointer/0.mp3') >= 695 && saved.indexOf('D:/Pointer/0.mp3') <= 705,
        'Native long drag commits the distant global destination',
    )
    expect(
        saved.length === 1000 && new Set(saved).size === 1000,
        'Native long drag preserves all 1000 unique tracks',
    )
    await win.reload()
    await wait(500)
    expect(
        JSON.stringify(saved) === JSON.stringify(await order()),
        'Saved order survives a renderer restart',
    )
    await wc.executeJavaScript(`document.querySelector('.appShell').scrollTop=0`)
    await wait(250)
    await begin(0)
    await wc.executeJavaScript(
        `history.pushState({},'', '/library'); window.dispatchEvent(new PopStateEvent('popstate'))`,
    )
    await wait(400)
    expect(
        await wc.executeJavaScript(
            `!document.querySelector('.playlistTrackRow--fallbackDragging') && !document.documentElement.classList.contains('cursor-grabbing')`,
        ),
        'Navigating during a drag removes its clone and grabbing cursor',
    )
    expect(
        JSON.stringify(saved) === JSON.stringify(await order()),
        'Navigating during a drag preserves the saved order',
    )
}

app.whenReady()
    .then(async () => {
        const win = new BrowserWindow({
            width: 1000,
            height: 800,
            show: false,
            webPreferences: { offscreen: true, backgroundThrottling: false },
        })
        await win.loadURL(
            process.env.PLAYLIST_TEST_URL || 'http://localhost:1422/playlist/playlist-test',
        )
        const checks = await win.webContents.executeJavaScript(`(${verify.toString()})()`)
        await verifyInput(win, checks)
        console.log(JSON.stringify({ passed: checks.length, checks }, null, 2))
        fs.mkdirSync('.impeccable/review', { recursive: true })
        fs.writeFileSync(
            '.impeccable/review/playlist-verification.json',
            JSON.stringify({ passed: checks.length, checks }, null, 2),
        )
        win.destroy()
        app.quit()
    })
    .catch((error) => {
        console.error(error)
        app.exit(1)
    })
