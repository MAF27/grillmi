import { describe, expect, it } from 'vitest'
import {
	favoriteFromServer,
	grilladeFromServer,
	grilladeToServer,
	plannedItemFromServer,
	plannedItemToServer,
	sessionItemToServer,
} from '$lib/sync/mappers'
import localRows from './__fixtures__/local-rows.json'
import serverResponse from './__fixtures__/server-response.json'

describe('contract fixture', () => {
	it('grilladeToServer matches the recorded local-rows fixture', () => {
		expect(grilladeToServer(localRows.grillade.input as never)).toEqual(localRows.grillade.expected)
		expect(grilladeToServer(localRows.grilladeAllNull.input as never)).toEqual(
			localRows.grilladeAllNull.expected,
		)
	})

	it('plannedItemToServer matches the recorded local-rows fixture', () => {
		expect(
			plannedItemToServer(localRows.plannedItem.input.item as never, localRows.plannedItem.input.index),
		).toEqual(localRows.plannedItem.expected)
	})

	it('sessionItemToServer matches the recorded local-rows fixture', () => {
		expect(
			sessionItemToServer(localRows.sessionItem.input.item as never, localRows.sessionItem.input.index),
		).toEqual(localRows.sessionItem.expected)
		expect(
			sessionItemToServer(
				localRows.sessionItemPlated.input.item as never,
				localRows.sessionItemPlated.input.index,
			),
		).toEqual(localRows.sessionItemPlated.expected)
	})

	it('grilladeFromServer matches the recorded server-response fixture', () => {
		expect(grilladeFromServer(serverResponse.grillade.input)).toEqual(serverResponse.grillade.expected)
		expect(grilladeFromServer(serverResponse.grilladeAllNull.input)).toEqual(
			serverResponse.grilladeAllNull.expected,
		)
	})

	it('plannedItemFromServer matches the recorded server-response fixture', () => {
		expect(plannedItemFromServer(serverResponse.plannedItem.input)).toEqual(serverResponse.plannedItem.expected)
		expect(plannedItemFromServer(serverResponse.plannedItemFallback.input)).toEqual(
			serverResponse.plannedItemFallback.expected,
		)
		expect(plannedItemFromServer(serverResponse.plannedItemUnknownCut.input)).toBeNull()
	})

	it('favoriteFromServer matches the recorded server-response fixture', () => {
		expect(favoriteFromServer(serverResponse.favorite.input)).toEqual(serverResponse.favorite.expected)
		expect(favoriteFromServer(serverResponse.favoriteUnknownCut.input)).toBeNull()
	})
})
