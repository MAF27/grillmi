import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import Button from '$lib/components/Button.svelte'

const Label = (text: string) =>
	createRawSnippet(() => ({ render: () => `<span>${text}</span>` }))

describe('Button', () => {
	it('test_renders_label_via_children_snippet', () => {
		const { getByRole } = render(Button, { props: { children: Label('Tap'), onclick: () => {} } })
		expect(getByRole('button').textContent?.trim()).toBe('Tap')
	})

	it('test_default_variant_is_primary', () => {
		const { container } = render(Button, { props: { children: Label('X') } })
		expect(container.querySelector('button.primary')).toBeTruthy()
	})

	it('test_variant_class_applies', () => {
		const variants: Array<'secondary' | 'ghost' | 'accentGhost' | 'destructive'> = [
			'secondary',
			'ghost',
			'accentGhost',
			'destructive',
		]
		for (const v of variants) {
			const { container, unmount } = render(Button, { props: { variant: v, children: Label('X') } })
			const cls = v === 'accentGhost' ? 'accent-ghost' : v
			expect(container.querySelector(`button.${cls}`)).toBeTruthy()
			unmount()
		}
	})

	it('test_size_class_applies', () => {
		const { container, rerender } = render(Button, { props: { size: 'sm', children: Label('X') } })
		expect(container.querySelector('button.sm')).toBeTruthy()
		rerender({ size: 'lg', children: Label('X') })
		expect(container.querySelector('button.lg')).toBeTruthy()
	})

	it('test_loading_renders_spinner_and_disables_button', () => {
		const { container, getByRole } = render(Button, { props: { loading: true, children: Label('X') } })
		expect(container.querySelector('.spinner')).toBeTruthy()
		expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true)
		expect(getByRole('button').getAttribute('aria-busy')).toBe('true')
	})

	it('test_disabled_attribute_set_when_disabled_prop_true', () => {
		const { getByRole } = render(Button, { props: { disabled: true, children: Label('X') } })
		expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true)
	})

	it('test_full_width_class_applies', () => {
		const { container } = render(Button, { props: { fullWidth: true, children: Label('X') } })
		expect(container.querySelector('button.full')).toBeTruthy()
	})
})
