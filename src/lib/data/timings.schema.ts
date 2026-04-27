import { z } from 'zod'

export const flipPatternSchema = z.enum(['once', 'every-60s', 'rotate'])

export const timingRowSchema = z
	.object({
		thicknessCm: z.number().positive().nullable(),
		prepLabel: z.string().nullable(),
		doneness: z.string().nullable(),
		cookSecondsMin: z.number().int().positive(),
		cookSecondsMax: z.number().int().positive(),
		flipFraction: z.number().min(0).max(1),
		idealFlipPattern: flipPatternSchema,
		restSeconds: z.number().int().nonnegative(),
		heatZone: z.string(),
		grateTempC: z.number().int().positive().nullable(),
		notes: z.string().nullable(),
	})
	.refine(r => r.cookSecondsMax >= r.cookSecondsMin, {
		message: 'cookSecondsMax must be >= cookSecondsMin',
	})
	.refine(r => r.thicknessCm !== null || r.prepLabel !== null, {
		message: 'row requires either thicknessCm or prepLabel',
	})

export const cutSchema = z.object({
	slug: z.string().min(1),
	name: z.string().min(1),
	hasThickness: z.boolean(),
	hasDoneness: z.boolean(),
	rows: z.array(timingRowSchema).min(1),
	notes: z.array(z.string()).default([]),
})

export const categorySchema = z.object({
	slug: z.string().min(1),
	name: z.string().min(1),
	cuts: z.array(cutSchema).min(1),
})

export const timingsSchema = z.object({
	version: z.string(),
	generatedAt: z.string(),
	categories: z.array(categorySchema).min(1),
})

export type FlipPattern = z.infer<typeof flipPatternSchema>
export type TimingRow = z.infer<typeof timingRowSchema>
export type Cut = z.infer<typeof cutSchema>
export type Category = z.infer<typeof categorySchema>
export type Timings = z.infer<typeof timingsSchema>
