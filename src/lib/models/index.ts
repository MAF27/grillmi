import type { SavedPlan } from '$lib/schemas'

export type {
	ItemStatus,
	PlannedItem,
	Plan,
	ScheduleEvent,
	SessionItem,
	Session,
	Favorite,
	SavedPlan,
	SoundAssignment,
	UserSettings,
} from '$lib/schemas'

// User-facing alias. The persisted shape stays `SavedPlan` to avoid an IDB
// migration; only the surface name moves to "Menü" / "Menüs".
export type Menu = SavedPlan
