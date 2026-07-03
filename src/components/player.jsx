import { Ellipsis, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import React from 'react'
import musicPlaceholder from '../assets/music-placeholder.png'

const Player = () => {
  return (
    <div id="bottom-player" className="fixed inset-x-0 bottom-0 z-999 border-t border-slate-300 bg-white shadow-[0_-10px_24px_rgba(14,24,42,0.12)]">
      <div className="box-border grid min-h-(--bottom-player-height,92px) grid-cols-1 gap-10px px-3.5 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(148px,0.8fr)] md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <img
            id="albumArt"
            src={musicPlaceholder}
            className="h-12.5 w-12.5 shrink-0 rounded-lg bg-slate-100 object-cover"
            alt="Current track cover"
          />

          <div className="min-w-0">
            <div id="trackTitle" className="truncate font-semibold text-slate-900">
              No song selected
            </div>

            <div id="trackArtist" className="truncate text-[13px] text-slate-500">
              Unknown artist
            </div>
          </div>
        </div>

        {/* Control Buttons */}

        <div className="min-w-0 grid gap-2">
          <div className="flex items-center justify-center gap-1.5">
            <button id="trackShuffleBtn" type="button" aria-label="Shuffle track" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 hover:bg-slate-100">
              <Shuffle />
            </button>

            <button id="prevBtn" type="button" aria-label="Previous track" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 hover:bg-slate-100">
              <SkipBack />
            </button>

            <button id="playPauseBtn" type="button" aria-label="Play/Pause" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800">

              <Play />
            </button>
            {/* <button className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100">
                <Pause />
            </button> */}

            <button id="nextBtn" type="button" aria-label="Next track" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 hover:bg-slate-100">
              <SkipForward />
            </button>

            <button id="trackRepeatBtn" type="button" aria-label="Repeat track" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 hover:bg-slate-100">
              <Repeat />
            </button>
          </div>

          <div className="grid min-w-0 grid-cols-[30px_minmax(100px,1fr)_30px] items-center gap-1.5 sm:grid-cols-[30px_minmax(100px,1fr)_30px]">
            <span id="currentTime" className="min-w-7.5 text-center text-[11px] text-slate-500">
              0:00
            </span>

            <input type="range" id="progressSlider" min="0" max="100" value="0" className="w-full accent-blue-600" />

            <span id="duration" className="min-w-7.5 text-center text-[11px] text-slate-500">
              2:00
            </span>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-start gap-1.5 sm:justify-end">
          <button id="volumeBtn" type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 hover:bg-slate-100">
            <Volume2 />
          </button>

          <input type="range" id="volumeSlider" min="0" max="1" step="0.01" value="0.7" className="w-full max-w-30 accent-blue-600" />

          <div className="relative inline-flex">
            <button
              id="trackMenuBtn"
              type="button"
              aria-label="Track menu"
              aria-haspopup="menu"
              aria-expanded="false"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 hover:bg-slate-100"
            >
              <Ellipsis />
            </button>

            <div id="trackMenu" className="absolute bottom-10.5 right-0 z-1200 hidden min-w-40 rounded-lg border border-slate-300 bg-white p-1.5 shadow-[0_8px_18px_rgba(23,31,56,0.16)]" role="menu" hidden>
              <button id="trackPropertiesBtn" className="flex h-8.5 w-full items-center justify-start gap-1.5 rounded-lg border border-transparent px-2.5 text-[12px] font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-100" type="button" role="menuitem">
                <i data-lucide="info"></i>
                Properties
              </button>
              <button id="trackEqualizerBtn" className="flex h-8.5 w-full items-center justify-start gap-1.5 rounded-lg border border-transparent px-2.5 text-[12px] font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-100" type="button" role="menuitem">
                <i data-lucide="settings-2"></i>
                Equalizer
              </button>
              <button id="trackTestBtn" className="flex h-8.5 w-full items-center justify-start gap-1.5 rounded-lg border border-transparent px-2.5 text-[12px] font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-100" type="button" role="menuitem">
                <i data-lucide="info"></i>
                Test
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Player