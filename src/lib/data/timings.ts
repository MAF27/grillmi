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
 *
 * Doneness must match exactly (case-insensitive substring) when the cut has a
 * doneness axis. For thickness, we linearly interpolate cookSeconds/restSeconds
 * between the two bracketing documented rows so the user can pick any 0.5 cm
 * step in the UI without losing precision.
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
		if (sorted.length === 1) return { ...sorted[0], thicknessCm }

		const exact = sorted.find(r => Math.abs(r.thicknessCm - thicknessCm) < 1e-6)
		if (exact) return exact

		// Below documented min: linearly extrapolate from the two lowest rows.
		// We let the user pick thinner slices than the reference documents
		// (e.g. 2 cm Rinds-Filet) and scale cookSeconds by the same slope the
		// reference data shows between its lowest two thicknesses.
		if (thicknessCm < sorted[0].thicknessCm) {
			if (sorted.length === 1) return { ...sorted[0], thicknessCm }
			const a = sorted[0]
			const b = sorted[1]
			const t = (thicknessCm - a.thicknessCm) / (b.thicknessCm - a.thicknessCm)
			return {
				thicknessCm,
				prepLabel: a.prepLabel,
				doneness: a.doneness,
				cookSecondsMin: Math.max(30, Math.round(a.cookSecondsMin + t * (b.cookSecondsMin - a.cookSecondsMin))),
				cookSecondsMax: Math.max(30, Math.round(a.cookSecondsMax + t * (b.cookSecondsMax - a.cookSecondsMax))),
				flipFraction: a.flipFraction,
				idealFlipPattern: a.idealFlipPattern,
				restSeconds: Math.max(0, Math.round(a.restSeconds + t * (b.restSeconds - a.restSeconds))),
				heatZone: a.heatZone,
				notes: a.notes,
			}
		}
		// Above documented max: clamp (no extrapolation — reverse-sear for very
		// thick cuts uses different mechanics that don't extrapolate cleanly).
		if (thicknessCm > sorted[sorted.length - 1].thicknessCm) {
			return { ...sorted[sorted.length - 1], thicknessCm }
		}

		// Linear interpolation between bracketing rows
		for (let i = 0; i < sorted.length - 1; i++) {
			const a = sorted[i]
			const b = sorted[i + 1]
			if (a.thicknessCm < thicknessCm && thicknessCm < b.thicknessCm) {
				const t = (thicknessCm - a.thicknessCm) / (b.thicknessCm - a.thicknessCm)
				return {
					thicknessCm,
					prepLabel: a.prepLabel,
					doneness: a.doneness,
					cookSecondsMin: Math.round(a.cookSecondsMin + t * (b.cookSecondsMin - a.cookSecondsMin)),
					cookSecondsMax: Math.round(a.cookSecondsMax + t * (b.cookSecondsMax - a.cookSecondsMax)),
					flipFraction: a.flipFraction,
					idealFlipPattern: a.idealFlipPattern,
					restSeconds: Math.round(a.restSeconds + t * (b.restSeconds - a.restSeconds)),
					heatZone: a.heatZone,
					notes: a.notes,
				}
			}
		}
		return sorted[0]
	}
	return candidates[0]
}

export type { Cut, Category, TimingRow }
