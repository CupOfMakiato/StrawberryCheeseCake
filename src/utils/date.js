export function formatDate(value) {
    const date = new Date(value)
    if (!value || Number.isNaN(date.getTime())) return '-'
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}
