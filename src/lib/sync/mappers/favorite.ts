import { findCutBySlug, findRow } from '$lib/data/timings'
import type { Favorite } from '$lib/schemas'

export function favoriteFromServer(r: Record<string, unknown>): Favorite | null {
	const cutSlug = String(r.cut_id ?? '')
	const found = findCutBySlug(cutSlug)
	// Server cut_id must resolve to a known cut in the bundled timings data;
	// otherwise we can't reconstruct the rich Favorite shape the client uses.
	if (!found) return null
	const thicknessCm = r.thickness_cm == null ? null : Number(r.thickness_cm)
	const doneness = (r.doneness as string | null) ?? null
	const row = findRow(found.cut, thicknessCm, doneness)
	if (!row) return null
	const cookSeconds = Math.round((row.cookSecondsMin + row.cookSecondsMax) / 2)
	return {
		id: String(r.id),
		name: String(r.label ?? ''),
		categorySlug: found.category.slug,
		cutSlug: found.cut.slug,
		thicknessCm,
		prepLabel: (r.prep_label as string | null) ?? null,
		doneness,
		label: (r.label as string | null) ?? null,
		cookSeconds,
		restSeconds: row.restSeconds,
		flipFraction: row.flipFraction,
		idealFlipPattern: row.idealFlipPattern,
		heatZone: row.heatZone,
		grateTempC: row.grateTempC,
		createdAtEpoch: Date.parse(String(r.created_at ?? '')) || Date.now(),
		lastUsedEpoch: Date.parse(String(r.last_used_at ?? '')) || Date.now(),
	}
}
