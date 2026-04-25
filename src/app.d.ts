// See https://kit.svelte.dev/docs/types#app

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		installPromptEvent?: BeforeInstallPromptEvent
	}

	interface BeforeInstallPromptEvent extends Event {
		readonly platforms: ReadonlyArray<string>
		readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
		prompt(): Promise<void>
	}
}

export {}
