export function formatHHMM(epoch: number): string {
	const d = new Date(epoch)
	const h = d.getHours().toString().padStart(2, '0')
	const m = d.getMinutes().toString().padStart(2, '0')
	return `${h}:${m}`
}

export function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.round(seconds))
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = total % 60
	if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
	return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function formatRelative(targetEpoch: number, now = Date.now()): string {
	const diffSec = Math.round((targetEpoch - now) / 1000)
	if (diffSec <= 0) return 'jetzt'
	const h = Math.floor(diffSec / 3600)
	const m = Math.floor((diffSec % 3600) / 60)
	if (h > 0) return `in ${h} h ${m} min`
	if (m > 0) return `in ${m} min`
	return `in ${diffSec} s`
}

export function isTomorrow(targetEpoch: number, now = Date.now()): boolean {
	return (
		targetEpoch > now + 12 * 3600 * 1000 || (new Date(targetEpoch).getDate() !== new Date(now).getDate() && targetEpoch > now)
	)
}
