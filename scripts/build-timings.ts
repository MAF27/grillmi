#!/usr/bin/env tsx
/**
 * Compiles resources/docs/grill-timings-reference.md into
 * src/lib/data/timings.generated.json + .d.ts.
 *
 * Failures throw — no silent fallback. Vite build fails if this fails.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { timingsSchema, type Category, type Cut, type FlipPattern, type TimingRow } from '../src/lib/data/timings.schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SOURCE_MD = resolve(ROOT, 'resources/docs/grill-timings-reference.md')
const OUT_JSON = resolve(ROOT, 'src/lib/data/timings.generated.json')
const OUT_DTS = resolve(ROOT, 'src/lib/data/timings.generated.d.ts')

// === Category map ===
// Maps the H2 heading text from the reference markdown to a slug + display name.
// The order here is the canonical order (= test_timings_schema_category_count expects 11).
const CATEGORY_MAP: ReadonlyArray<{ pattern: RegExp; slug: string; name: string }> = [
	{ pattern: /^Beef\s*\(Rind\)/i, slug: 'beef', name: 'Rind' },
	{ pattern: /^Veal\s*\(Kalb\)/i, slug: 'veal', name: 'Kalb' },
	{ pattern: /^Pork\s*\(Schwein\)/i, slug: 'pork', name: 'Schwein' },
	{ pattern: /^Lamb\s*\(Lamm\)/i, slug: 'lamb', name: 'Lamm' },
	{ pattern: /^Horse\s*\(Pferd\)/i, slug: 'horse', name: 'Pferd' },
	{ pattern: /^Poultry\s*\(Geflügel\)/i, slug: 'poultry', name: 'Geflügel' },
	{ pattern: /^Sausage\s*\(Wurst\)/i, slug: 'sausage', name: 'Wurst' },
	{ pattern: /^Various meats/i, slug: 'various', name: 'Diverse' },
	{ pattern: /^Fish\s*\(Fisch\)/i, slug: 'fish', name: 'Fisch' },
	{ pattern: /^Vegetables/i, slug: 'vegetables', name: 'Gemüse' },
	{ pattern: /^Fruit\s*\(Früchte\)/i, slug: 'fruit', name: 'Früchte' },
]

interface Section {
	heading: string
	bodyLines: string[]
}

function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

function splitH2Sections(md: string): Section[] {
	const lines = md.split('\n')
	const sections: Section[] = []
	let current: Section | null = null
	for (const line of lines) {
		const m = /^## (.+)$/.exec(line)
		if (m) {
			if (current) sections.push(current)
			current = { heading: m[1].trim(), bodyLines: [] }
		} else if (current) {
			current.bodyLines.push(line)
		}
	}
	if (current) sections.push(current)
	return sections
}

function splitH3Sections(lines: string[]): Section[] {
	const sections: Section[] = []
	let current: Section | null = null
	for (const line of lines) {
		const m = /^### (.+)$/.exec(line)
		if (m) {
			if (current) sections.push(current)
			current = { heading: m[1].trim(), bodyLines: [] }
		} else if (current) {
			current.bodyLines.push(line)
		}
	}
	if (current) sections.push(current)
	return sections
}

function extractTable(lines: string[]): { headers: string[]; rows: string[][] } | null {
	const tableLines: string[] = []
	let inTable = false
	for (const line of lines) {
		const trimmed = line.trim()
		if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
			tableLines.push(trimmed)
			inTable = true
		} else if (inTable && trimmed === '') {
			break
		} else if (inTable) {
			break
		}
	}
	if (tableLines.length < 2) return null

	const splitRow = (row: string): string[] =>
		row
			.replace(/^\||\|$/g, '')
			.split('|')
			.map(c => c.trim())

	const headers = splitRow(tableLines[0])
	const dataLines = tableLines.slice(2).filter(l => !/^\|[\s|:-]+\|$/.test(l))
	const rows = dataLines.map(splitRow).filter(r => r.length === headers.length)
	return { headers, rows }
}

const FLIP_KEYWORDS_60S = /every\s*(60\s*s|45\s*s|2\s*min)/i
const ROTATE_KEYWORDS = /rotate|quarter\s*turn|roll\s*every|every\s*\d+\s*min/i

function inferFlip(turnsText: string): { fraction: number; pattern: FlipPattern } {
	const t = turnsText.toLowerCase()
	if (FLIP_KEYWORDS_60S.test(t)) return { fraction: 0.5, pattern: 'every-60s' }
	if (ROTATE_KEYWORDS.test(t)) return { fraction: 0.5, pattern: 'rotate' }
	if (/no\s*flip|none|cut-side\s*only/.test(t)) return { fraction: 1, pattern: 'once' }
	return { fraction: 0.5, pattern: 'once' }
}

// Parse "3-4 min" / "3–4 min" / "30 s" / "1 h" / "1.5 h" / "2 min" into [minSec, maxSec].
// Also handles compound expressions like "10–15 ind + 1.5/side direct" (uses outer numeric range).
function parseDurationRange(raw: string): [number, number] | null {
	if (!raw || raw === '—' || raw === '-') return null
	const cleaned = raw.replace(/\s+/g, ' ').trim()

	// Hours: "~6 h" / "5 h" / "2.5 h" / "2.5–3.5 h"
	const hRange = /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*h(?!\w)/.exec(cleaned)
	if (hRange) return [Math.round(parseFloat(hRange[1]) * 3600), Math.round(parseFloat(hRange[2]) * 3600)]
	const hSingle = /(\d+(?:\.\d+)?)\s*h(?!\w)/.exec(cleaned)
	if (hSingle) {
		const v = Math.round(parseFloat(hSingle[1]) * 3600)
		return [v, v]
	}

	// Minute range "8–10 min" / "8-10 min"
	const minRange = /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*min/.exec(cleaned)
	if (minRange) return [Math.round(parseFloat(minRange[1]) * 60), Math.round(parseFloat(minRange[2]) * 60)]

	// Single "2 min"
	const minSingle = /(\d+(?:\.\d+)?)\s*min/.exec(cleaned)
	if (minSingle) {
		const v = Math.round(parseFloat(minSingle[1]) * 60)
		return [v, v]
	}

	// Seconds range "90 s–2 min" already handled by min above; bare seconds:
	const sRange = /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*s(?!ide)/.exec(cleaned)
	if (sRange) return [Math.round(parseFloat(sRange[1])), Math.round(parseFloat(sRange[2]))]
	const sSingle = /(\d+(?:\.\d+)?)\s*s(?!ide)/.exec(cleaned)
	if (sSingle) {
		const v = Math.round(parseFloat(sSingle[1]))
		return [v, v]
	}

	return null
}

function parseRest(raw: string): number {
	if (!raw || raw === '—' || raw === '-') return 0
	const range = parseDurationRange(raw)
	if (!range) return 0
	// Use the lower end for rest (conservative): user can pull early if desired.
	return range[0]
}

function parseThicknessCm(raw: string): number | null {
	// Examples: "2 cm", "2.5 cm", "1.5–2 cm", "3 cm (tournedos)", "1 cm slices"
	const m = /(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*cm/.exec(raw)
	if (!m) return null
	const lo = parseFloat(m[1])
	const hi = m[2] ? parseFloat(m[2]) : lo
	return (lo + hi) / 2
}

interface RawRow {
	[header: string]: string
}

function pickColumn(row: RawRow, ...candidates: string[]): string {
	for (const c of candidates) {
		for (const k of Object.keys(row)) {
			if (k.toLowerCase().trim() === c.toLowerCase()) return row[k]
		}
	}
	for (const c of candidates) {
		for (const k of Object.keys(row)) {
			if (k.toLowerCase().includes(c.toLowerCase())) return row[k]
		}
	}
	return ''
}

interface ParseStats {
	categories: number
	cutsAttempted: number
	cutsKept: number
	cutsSkipped: { name: string; reason: string }[]
	rowsParsed: number
}

function parseCut(name: string, body: string[], stats: ParseStats): Cut | null {
	stats.cutsAttempted += 1
	const tbl = extractTable(body)
	if (!tbl) {
		stats.cutsSkipped.push({ name, reason: 'no markdown table' })
		return null
	}

	// Notes (lines after "Notes:")
	const notes: string[] = []
	let inNotes = false
	for (const line of body) {
		if (/^Notes:/i.test(line.trim())) {
			inNotes = true
			continue
		}
		if (inNotes) {
			if (/^Sources:/i.test(line.trim())) break
			const m = /^-\s+(.*)$/.exec(line.trim())
			if (m) notes.push(m[1])
		}
	}

	const headersLower = tbl.headers.map(h => h.toLowerCase().trim())
	const hasThicknessCol = headersLower.some(h => /thickness/.test(h))
	const hasDonenessCol = headersLower.some(h => /doneness/.test(h))

	const rows: TimingRow[] = []
	for (const cells of tbl.rows) {
		const row: RawRow = {}
		tbl.headers.forEach((h, i) => (row[h] = cells[i] ?? ''))

		const totalRaw =
			pickColumn(row, 'Total') || pickColumn(row, 'Timing') || pickColumn(row, 'Time') || pickColumn(row, 'Per side')
		const cookRange = parseDurationRange(totalRaw)
		if (!cookRange) continue

		const restRaw = pickColumn(row, 'Rest')
		const restSeconds = parseRest(restRaw)

		const turnsRaw = pickColumn(row, 'Turns', 'Turn')
		const flip = inferFlip(turnsRaw)

		const heatZone = pickColumn(row, 'Heat zone', 'Method').trim() || '—'

		const thicknessRaw = pickColumn(
			row,
			'Thickness',
			'Thickness / weight',
			'Cut',
			'Type',
			'Size',
			'Patty style',
			'Preparation',
			'Weight',
			'Piece size',
			'Size / count',
			'Method',
			'Typical mix',
			'Thickness / weight',
		)
		const thicknessCm = hasThicknessCol ? parseThicknessCm(thicknessRaw) : null
		const doneness = hasDonenessCol ? (pickColumn(row, 'Doneness') || '').replace(/\s*\d+\s*°C.*$/, '').trim() || null : null

		const firstCol = (cells[0] ?? '').replace(/\s+/g, ' ').trim()
		const prepLabel = thicknessCm === null ? thicknessRaw.replace(/\s+/g, ' ').trim() || firstCol || null : null

		const note = pickColumn(row, 'Notes').trim()

		rows.push({
			thicknessCm,
			prepLabel,
			doneness,
			cookSecondsMin: cookRange[0],
			cookSecondsMax: cookRange[1],
			flipFraction: flip.fraction,
			idealFlipPattern: flip.pattern,
			restSeconds,
			heatZone,
			notes: note || null,
		})
	}

	if (rows.length === 0) {
		stats.cutsSkipped.push({ name, reason: 'no parseable rows' })
		return null
	}

	stats.rowsParsed += rows.length
	stats.cutsKept += 1

	const slug = slugify(name)
	const displayName = name.replace(/\s*\(.*?\)\s*$/, '').trim() || name

	return {
		slug,
		name: displayName,
		hasThickness: hasThicknessCol && rows.some(r => r.thicknessCm !== null),
		hasDoneness: hasDonenessCol && rows.some(r => r.doneness !== null),
		rows,
		notes,
	}
}

function parse(): { timings: Awaited<ReturnType<typeof timingsSchema.parseAsync>>; stats: ParseStats } {
	const md = readFileSync(SOURCE_MD, 'utf8')
	const stats: ParseStats = { categories: 0, cutsAttempted: 0, cutsKept: 0, cutsSkipped: [], rowsParsed: 0 }
	const h2 = splitH2Sections(md)
	const categories: Category[] = []

	for (const cat of CATEGORY_MAP) {
		const section = h2.find(s => cat.pattern.test(s.heading))
		if (!section) {
			throw new Error(`build-timings: missing category "${cat.name}" in reference markdown`)
		}
		const cuts: Cut[] = []
		for (const cutSec of splitH3Sections(section.bodyLines)) {
			const cut = parseCut(cutSec.heading, cutSec.bodyLines, stats)
			if (cut) cuts.push(cut)
		}
		if (cuts.length === 0) {
			throw new Error(`build-timings: category "${cat.name}" produced zero cuts`)
		}
		categories.push({ slug: cat.slug, name: cat.name, cuts })
		stats.categories += 1
	}

	fillDonenesses(categories, stats)

	const timings = timingsSchema.parse({
		version: '1.0.0',
		generatedAt: new Date().toISOString(),
		categories,
	})
	return { timings, stats }
}

// Categories where the user expects every steak doneness (Rare/Medium-rare/Medium/Well-done)
// to be selectable, even if the reference markdown only documents one or two.
const STEAK_DONENESS_CATEGORIES = new Set(['beef', 'veal', 'pork', 'lamb', 'horse'])
const REQUIRED_STEAK_DONENESSES = ['Rare', 'Medium-rare', 'Medium', 'Well-done'] as const
// Cook-time scaling factors against documented Medium-rare. Derived from the
// Rinds-Entrecôte reference rows (Rare 0.78x, Medium 1.28x, Well-done 1.71x).
const DONENESS_SCALE: Record<string, number> = {
	Rare: 0.78,
	'Medium-rare': 1.0,
	Medium: 1.28,
	'Well-done': 1.71,
}

function scaleRow(base: TimingRow, fromDoneness: string, toDoneness: string): TimingRow {
	const fromScale = DONENESS_SCALE[fromDoneness] ?? 1
	const toScale = DONENESS_SCALE[toDoneness] ?? 1
	const factor = toScale / fromScale
	return {
		...base,
		doneness: toDoneness,
		cookSecondsMin: Math.round(base.cookSecondsMin * factor),
		cookSecondsMax: Math.round(base.cookSecondsMax * factor),
	}
}

function fillDonenesses(categories: Category[], stats: ParseStats): void {
	void stats
	for (const cat of categories) {
		if (!STEAK_DONENESS_CATEGORIES.has(cat.slug)) continue
		for (const cut of cat.cuts) {
			if (!cut.hasDoneness) continue

			// Group documented rows by thickness (or 'all' when there is no thickness axis)
			const buckets = new Map<string, TimingRow[]>()
			for (const r of cut.rows) {
				const key = r.thicknessCm === null ? 'all' : r.thicknessCm.toString()
				if (!buckets.has(key)) buckets.set(key, [])
				buckets.get(key)!.push(r)
			}

			const synthesized: TimingRow[] = []
			for (const [, rows] of buckets) {
				const have = new Set(rows.map(r => r.doneness).filter((d): d is string => d !== null))
				if (have.size === 0) continue

				// Anchor = Medium-rare if present, else the row whose scale we can use most reliably
				const anchor =
					rows.find(r => r.doneness === 'Medium-rare') ??
					rows.find(r => r.doneness && DONENESS_SCALE[r.doneness] !== undefined) ??
					rows[0]
				if (!anchor.doneness) continue

				for (const target of REQUIRED_STEAK_DONENESSES) {
					if (have.has(target)) continue
					if (!(target in DONENESS_SCALE) || !(anchor.doneness in DONENESS_SCALE)) continue
					synthesized.push(scaleRow(anchor, anchor.doneness, target))
				}
			}

			if (synthesized.length > 0) {
				cut.rows.push(...synthesized)
				cut.rows.sort((a, b) => {
					const ta = a.thicknessCm ?? 0
					const tb = b.thicknessCm ?? 0
					if (ta !== tb) return ta - tb
					const da = REQUIRED_STEAK_DONENESSES.indexOf(a.doneness as never)
					const db = REQUIRED_STEAK_DONENESSES.indexOf(b.doneness as never)
					return (da === -1 ? 99 : da) - (db === -1 ? 99 : db)
				})
			}
		}
	}
}

function emit(): void {
	const { timings, stats } = parse()
	writeFileSync(OUT_JSON, JSON.stringify(timings, null, 2) + '\n', 'utf8')
	writeFileSync(
		OUT_DTS,
		`// Auto-generated by scripts/build-timings.ts. Do not edit.\nimport type { Timings } from './timings.schema'\ndeclare const timings: Timings\nexport default timings\n`,
		'utf8',
	)
	console.log(
		`build-timings: ${stats.categories} categories, ${stats.cutsKept}/${stats.cutsAttempted} cuts kept, ${stats.rowsParsed} rows.`,
	)
	if (stats.cutsSkipped.length > 0) {
		console.log('build-timings: skipped cuts (no parseable timing data):')
		for (const s of stats.cutsSkipped) console.log(`  - ${s.name}: ${s.reason}`)
	}
}

emit()
