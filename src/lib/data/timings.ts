import { timingsSchema, type Cut, type Category, type TimingRow } from './timings.schema'
import generated from './timings.generated.json'

export const TIMINGS = timingsSchema.parse(generated)

export function findCategory(slug: string): Category | undefined {
	return TIMINGS.categories.find(c => c.slug === slug)
}

export function findCut(categorySlug: string, cutSlug: string): Cut | undefined {
	return findCategory(categorySlug)?.cuts.find(c => c.slug === cutSlug)
}

export function findCutBySlug(cutSlug: string): { category: Category; cut: Cut } | undefined {
	for (const category of TIMINGS.categories) {
		const cut = category.cuts.find(c => c.slug === cutSlug)
		if (cut) return { category, cut }
	}
	return undefined
}

/**
 * Pick the timing row that best matches the given thickness and doneness.
 *
 * Doneness must match exactly (case-insensitive). Thickness snaps to the
 * nearest documented value; we never interpolate or extrapolate cook times.
 * The UI only offers documented thicknesses, so off-grid values can only
 * occur via legacy favorites or external imports.
 */
export function findRow(cut: Cut, thicknessCm: number | null, doneness: string | null): TimingRow | undefined {
	const candidates = cut.rows.filter(r => {
		if (cut.hasDoneness && doneness) return (r.doneness ?? '').toLowerCase() === doneness.toLowerCase()
		return true
	})
	if (candidates.length === 0) return undefined

	if (cut.hasThickness && thicknessCm !== null) {
		const sorted = candidates
			.filter((r): r is TimingRow & { thicknessCm: number } => r.thicknessCm !== null)
			.sort((a, b) => a.thicknessCm - b.thicknessCm)
		if (sorted.length === 0) return candidates[0]

		const exact = sorted.find(r => Math.abs(r.thicknessCm - thicknessCm) < 1e-6)
		if (exact) return exact

		// Off-grid: snap to the closest documented thickness. On ties (e.g.
		// 1.5 cm exactly between 1 and 2), prefer the larger row — overcooked
		// beats undercooked when the user picks a half-step we haven't measured.
		let nearest = sorted[0]
		let bestDelta = Math.abs(sorted[0].thicknessCm - thicknessCm)
		for (const row of sorted) {
			const delta = Math.abs(row.thicknessCm - thicknessCm)
			if (delta <= bestDelta) {
				bestDelta = delta
				nearest = row
			}
		}
		return nearest
	}
	return candidates[0]
}

export type { Cut, Category, TimingRow }
