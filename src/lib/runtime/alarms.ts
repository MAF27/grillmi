import { settingsStore } from '$lib/stores/settingsStore.svelte'
import { play } from '$lib/sounds/player'
import { formatDuration } from '$lib/util/format'

export type AlarmEvent = 'put-on' | 'flip' | 'done'

export function alarmSoundFor(event: AlarmEvent): string {
	const sounds = settingsStore.sounds
	if (event === 'put-on') return sounds.putOn
	if (event === 'flip') return sounds.flip
	return sounds.done
}

export function fireHaptic(): void {
	if (typeof navigator === 'undefined') return
	const vibrate = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate
	if (typeof vibrate === 'function') vibrate.call(navigator, [200])
}

export async function fireAlarm(event: AlarmEvent): Promise<void> {
	const sound = alarmSoundFor(event)
	await play(sound).catch(() => {})
	fireHaptic()
}

export function messageFor(event: AlarmEvent, label: string, leadSeconds = 0): string {
	if (leadSeconds > 0) {
		const lead = formatDuration(leadSeconds)
		switch (event) {
			case 'put-on':
				return `${label} in ${lead} auflegen`
			case 'flip':
				return `${label} in ${lead} wenden`
			case 'done':
				return `${label} in ${lead} fertig`
		}
	}
	switch (event) {
		case 'put-on':
			return `${label} jetzt auflegen`
		case 'flip':
			return `${label}: jetzt wenden`
		case 'done':
			return `${label} ist fertig`
	}
}
