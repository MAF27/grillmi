import { z } from 'zod'

export const itemStatusSchema = z.enum(['pending', 'cooking', 'resting', 'ready', 'plated'])

export const plannedItemSchema = z.object({
	id: z.string().uuid(),
	categorySlug: z.string(),
	cutSlug: z.string(),
	thicknessCm: z.number().nullable(),
	prepLabel: z.string().nullable(),
	doneness: z.string().nullable(),
	label: z.string().nullable(),
	cookSeconds: z.number().int().positive(),
	restSeconds: z.number().int().nonnegative(),
	flipFraction: z.number().min(0).max(1),
	idealFlipPattern: z.enum(['once', 'every-60s', 'rotate']),
	heatZone: z.string(),
})

export const planSchema = z.object({
	targetEpoch: z.number().int(),
	items: z.array(plannedItemSchema),
})

export const scheduleEventSchema = z.object({
	type: z.enum(['put-on', 'flip', 'done', 'resting-complete']),
	at: z.number().int(),
	itemId: z.string().uuid(),
})

export const sessionItemSchema = plannedItemSchema.extend({
	putOnEpoch: z.number().int(),
	flipEpoch: z.number().int().nullable(),
	doneEpoch: z.number().int(),
	restingUntilEpoch: z.number().int(),
	status: itemStatusSchema,
	overdue: z.boolean(),
	flipFired: z.boolean().default(false),
	platedEpoch: z.number().int().nullable().default(null),
})

export const sessionSchema = z.object({
	id: z.string().uuid(),
	createdAtEpoch: z.number().int(),
	targetEpoch: z.number().int(),
	endedAtEpoch: z.number().int().nullable(),
	items: z.array(sessionItemSchema),
})

export const favoriteSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(60),
	items: z.array(plannedItemSchema),
	createdAtEpoch: z.number().int(),
	lastUsedEpoch: z.number().int(),
})

export const soundAssignmentSchema = z.object({
	putOn: z.string(),
	flip: z.string(),
	done: z.string(),
})

export const userSettingsSchema = z.object({
	theme: z.enum(['system', 'light', 'dark']).default('system'),
	sounds: soundAssignmentSchema.default({ putOn: 'chime-1', flip: 'chime-2', done: 'chime-3' }),
	firstRunSeen: z.boolean().default(false),
})

export type ItemStatus = z.infer<typeof itemStatusSchema>
export type PlannedItem = z.infer<typeof plannedItemSchema>
export type Plan = z.infer<typeof planSchema>
export type ScheduleEvent = z.infer<typeof scheduleEventSchema>
export type SessionItem = z.infer<typeof sessionItemSchema>
export type Session = z.infer<typeof sessionSchema>
export type Favorite = z.infer<typeof favoriteSchema>
export type SoundAssignment = z.infer<typeof soundAssignmentSchema>
export type UserSettings = z.infer<typeof userSettingsSchema>
