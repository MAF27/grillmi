import type { PlannedItem, SessionItem } from '$lib/models'
import { findCut, findRow } from '$lib/data/timings'

export function isDefaultHeatZone(value: string): boolean {
	const normalized = value.trim().toLowerCase()
	return normalized === 'direkt, deckel zu' || normalized === '—' || normalized === '-'
}

export function tipsForItem(item: PlannedItem | SessionItem): string[] {
	const tips: string[] = []
	if (item.heatZone && !isDefaultHeatZone(item.heatZone)) {
		tips.push(`Grillmethode: ${item.heatZone}`)
	}
	const cut = findCut(item.categorySlug, item.cutSlug)
	if (cut) {
		const row = findRow(cut, item.thicknessCm, item.doneness)
		if (row?.notes) tips.push(row.notes)
		for (const note of cut.notes) tips.push(note)
	}
	return tips
}
