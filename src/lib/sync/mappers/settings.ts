export interface ServerSettings {
	value: Record<string, unknown>
	updated_at: string | null
}

export function settingsValueFromServer(payload: ServerSettings | null): Record<string, unknown> | null {
	if (!payload || !payload.value) return null
	return payload.value
}
