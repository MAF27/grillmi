import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import AlarmBanner from '$lib/components/AlarmBanner.svelte'

describe('AlarmBanner', () => {
	it('test_renders_trigger_and_item_name', () => {
		const { getByText } = render(AlarmBanner, { props: { kind: 'flip', itemName: 'Entrecôte', onDismiss: () => {} } })
		expect(getByText('Wenden')).toBeInTheDocument()
		expect(getByText('Entrecôte')).toBeInTheDocument()
		expect(getByText(/jetzt wenden/)).toBeInTheDocument()
	})

	it('test_renders_putOn_eyebrow', () => {
		const { getByText } = render(AlarmBanner, { props: { kind: 'on', itemName: 'Steak', onDismiss: () => {} } })
		expect(getByText('Auflegen')).toBeInTheDocument()
	})

	it('test_renders_ready_eyebrow', () => {
		const { getByText } = render(AlarmBanner, { props: { kind: 'ready', itemName: 'Steak', onDismiss: () => {} } })
		expect(getByText('Fertig')).toBeInTheDocument()
	})

	it('test_queue_depth_pill_renders_when_multiple', () => {
		const { getByText } = render(AlarmBanner, { props: { kind: 'flip', itemName: 'Steak', count: 3, onDismiss: () => {} } })
		expect(getByText('+2')).toBeInTheDocument()
	})

	it('test_dismiss_button_fires_callback', async () => {
		const onDismiss = vi.fn()
		const { getByLabelText } = render(AlarmBanner, { props: { kind: 'flip', itemName: 'Steak', onDismiss } })
		await fireEvent.click(getByLabelText('Bestätigen'))
		expect(onDismiss).toHaveBeenCalled()
	})
})
