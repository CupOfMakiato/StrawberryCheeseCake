export function formatDurationClock(totalSeconds) {
    const safeSeconds = Number(totalSeconds)
    if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) {
        return '0:00'
    }

    const rounded = Math.floor(safeSeconds)
    const minutes = Math.floor(rounded / 60)
    const seconds = rounded % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
}
