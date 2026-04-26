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

// === Source category map ===
// Maps the H2 heading text from the reference markdown to a parse-time slug.
// These are the *parse* categories — the UI categories below regroup them.
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

// === UI category map ===
// What the user sees and picks from. Cuts are pulled from one or more parse
// categories by slug. Order is intentional — common first, plants mid,
// rare meats at the end.
interface UiCategory {
	slug: string
	name: string
	pull: ReadonlyArray<{ from: string; cuts: 'all' | string[] }>
}

// Slugs include the parenthetical English from the markdown headings.
const HAMBURGER = 'hamburger-hackfleisch-patties'
const BBQ_SPECK = 'bbq-speck-speckscheiben-vom-grill'
const MIXED_GRILL = 'mixed-grill-spiessli-gemischte-spiessli'
const KANINCHEN = 'kaninchenfilets-kaninchen-filets'
const POULETSPIESSLI = 'pouletspiessli-chicken-skewers'
const PFERDESTEAK = 'pferdesteak-horse-steak'
const HALLOUMI = 'halloumi'
const PANEER = 'paneer'

const UI_CATEGORIES: ReadonlyArray<UiCategory> = [
	{
		slug: 'beef',
		name: 'Rind',
		pull: [
			{ from: 'beef', cuts: 'all' },
			{ from: 'various', cuts: [HAMBURGER] },
		],
	},
	{ slug: 'veal', name: 'Kalb', pull: [{ from: 'veal', cuts: 'all' }] },
	{
		slug: 'pork',
		name: 'Schwein',
		pull: [
			{ from: 'pork', cuts: 'all' },
			{ from: 'various', cuts: [BBQ_SPECK] },
		],
	},
	{ slug: 'lamb', name: 'Lamm', pull: [{ from: 'lamb', cuts: 'all' }] },
	{ slug: 'poultry', name: 'Geflügel', pull: [{ from: 'poultry', cuts: 'all' }] },
	{ slug: 'sausage', name: 'Wurst', pull: [{ from: 'sausage', cuts: 'all' }] },
	{
		slug: 'skewers',
		name: 'Spiessli',
		pull: [
			{ from: 'poultry', cuts: [POULETSPIESSLI] },
			{ from: 'various', cuts: [MIXED_GRILL] },
		],
	},
	{ slug: 'fish', name: 'Fisch', pull: [{ from: 'fish', cuts: 'all' }] },
	{
		slug: 'cheese',
		name: 'Käse',
		pull: [{ from: 'vegetables', cuts: [HALLOUMI, PANEER] }],
	},
	{ slug: 'vegetables', name: 'Gemüse', pull: [{ from: 'vegetables', cuts: 'all' }] },
	{ slug: 'fruit', name: 'Früchte', pull: [{ from: 'fruit', cuts: 'all' }] },
	{
		slug: 'special',
		name: 'Spezial',
		pull: [
			{ from: 'horse', cuts: [PFERDESTEAK] },
			{ from: 'various', cuts: [KANINCHEN] },
		],
	},
]

const POULTRY_TO_SKEWERS = new Set([POULETSPIESSLI])

function regroupCategories(parsed: Category[]): Category[] {
	const bySlug = new Map(parsed.map(c => [c.slug, c]))
	const out: Category[] = []
	const usedCuts = new Map<string, Set<string>>()

	for (const ui of UI_CATEGORIES) {
		const cuts: Cut[] = []
		for (const ref of ui.pull) {
			const src = bySlug.get(ref.from)
			if (!src) throw new Error(`build-timings: UI category "${ui.slug}" pulls unknown parse category "${ref.from}"`)
			const used = usedCuts.get(ref.from) ?? new Set<string>()
			usedCuts.set(ref.from, used)
			if (ref.cuts === 'all') {
				for (const c of src.cuts) {
					if (used.has(c.slug)) continue
					if (ref.from === 'poultry' && POULTRY_TO_SKEWERS.has(c.slug)) continue
					cuts.push(c)
					used.add(c.slug)
				}
			} else {
				for (const slug of ref.cuts) {
					const c = src.cuts.find(x => x.slug === slug)
					if (!c) throw new Error(`build-timings: UI category "${ui.slug}" pulls unknown cut "${slug}" from "${ref.from}"`)
					if (used.has(slug)) throw new Error(`build-timings: cut "${slug}" pulled twice from "${ref.from}"`)
					cuts.push(c)
					used.add(slug)
				}
			}
		}
		if (cuts.length === 0) throw new Error(`build-timings: UI category "${ui.slug}" produced zero cuts`)
		out.push({ slug: ui.slug, name: ui.name, cuts })
	}

	for (const src of parsed) {
		const used = usedCuts.get(src.slug) ?? new Set<string>()
		const orphans = src.cuts.filter(c => !used.has(c.slug))
		if (orphans.length > 0) {
			throw new Error(`build-timings: parsed cuts orphaned from "${src.slug}": ${orphans.map(c => c.slug).join(', ')}`)
		}
	}
	return out
}

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

const FLIP_KEYWORDS_60S = /every\s*(60\s*s|45\s*s|2\s*min)|alle\s*(60\s*s|45\s*s|2\s*min)/i
const ROTATE_KEYWORDS =
	/rotate|quarter\s*turn|roll\s*every|every\s*\d+\s*min|alle\s*\d+(\.\d+)?\s*min\s*(drehen|rollen|wenden)|viertel(-|\s)?drehen/i
const NO_FLIP_KEYWORDS = /no\s*flip|none|cut-side\s*only|nicht\s*wenden|nur\s*einseitig|schnittseite\s*nur/i

function inferFlip(turnsText: string): { fraction: number; pattern: FlipPattern } {
	const t = turnsText.toLowerCase()
	if (FLIP_KEYWORDS_60S.test(t)) return { fraction: 0.5, pattern: 'every-60s' }
	if (ROTATE_KEYWORDS.test(t)) return { fraction: 0.5, pattern: 'rotate' }
	if (NO_FLIP_KEYWORDS.test(t)) return { fraction: 1, pattern: 'once' }
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

	// Compound "X min Y s" / "X min Y sec" — parse before plain "X min" so the
	// trailing seconds aren't dropped. Examples: "2 min 30 s", "1 min 15 s".
	const minSec = /(\d+)\s*min\s*(\d+)\s*s(?!ide)/.exec(cleaned)
	if (minSec) {
		const total = parseInt(minSec[1], 10) * 60 + parseInt(minSec[2], 10)
		return [total, total]
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
		// Treat em-dash / dash placeholders as "no doneness" — these are data
		// holes the source markdown carries to keep the table shape, not real
		// doneness levels.
		const donenessRaw = hasDonenessCol ? (pickColumn(row, 'Doneness') || '').replace(/\s*\d+\s*°C.*$/, '').trim() : ''
		const doneness = donenessRaw && donenessRaw !== '—' && donenessRaw !== '-' ? donenessRaw : null

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

	const regrouped = regroupCategories(categories)
	const timings = timingsSchema.parse({
		version: '1.0.0',
		generatedAt: new Date().toISOString(),
		categories: regrouped,
	})
	return { timings, stats }
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
