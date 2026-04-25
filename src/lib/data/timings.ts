import { timingsSchema, type Cut, type Category, type TimingRow } from './timings.schema'
import generated from './timings.generated.json'

export const TIMINGS = timingsSchema.parse(generated)

export function findCategory(slug: string): Category | undefined {
	return TIMINGS.categories.find(c => c.slug === slug)
}

export function findCut(categorySlug: string, cutSlug: string): Cut | undefined {
	return findCategory(categorySlug)?.cuts.find(c => c.slug === cutSlug)
}

/**
 * Pick the timing row that best matches the given thickness and doneness.
 * Falls back to nearest thickness; doneness match is hard-required when present.
 */
export function findRow(cut: Cut, thicknessCm: number | null, doneness: string | null): TimingRow | undefined {
	const candidates = cut.rows.filter(r => {
		if (cut.hasDoneness && doneness) return (r.doneness ?? '').toLowerCase().includes(doneness.toLowerCase())
		return true
	})
	if (cut.hasThickness && thicknessCm !== null) {
		let best: TimingRow | undefined
		let bestDelta = Infinity
		for (const r of candidates) {
			if (r.thicknessCm === null) continue
			const d = Math.abs(r.thicknessCm - thicknessCm)
			if (d < bestDelta) {
				best = r
				bestDelta = d
			}
		}
		if (best) return best
	}
	return candidates[0]
}

export type { Cut, Category, TimingRow }
