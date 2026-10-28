import rubikUrl from '../assets/fonts/Rubik.ttf?url'

// Register the bundled reference font without a separate stylesheet.
const rubik = new window.FontFace('Rubik Reference', `url(${rubikUrl})`, {
    weight: '300 900',
    display: 'swap',
})
document.fonts.add(rubik)
rubik.load().catch(() => {})

export const musicSurfaceClasses =
    "font-['Rubik_Reference',sans-serif] leading-[normal] selection:bg-[color-mix(in_srgb,var(--accent-color)_20%,white)] **:focus-visible:outline-2 **:focus-visible:outline-solid **:focus-visible:outline-(--accent-color) **:focus-visible:outline-offset-2"

export const musicButtonClasses =
    'min-h-[34px] rounded-lg border border-[#cfd7e2] bg-white px-[10px] py-0 font-[Arial,sans-serif] text-[12px] leading-[normal] font-semibold text-[#273244] hover:bg-[color-mix(in_srgb,var(--accent-color)_5%,white)] disabled:opacity-50'
