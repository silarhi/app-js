/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { ServiceMap } from '../Container'
import { on } from '../dom'
import type { Listener } from '../types'
import type { CollectionManager } from './CollectionManager'

/**
 * The buttons of the collection form theme: an add button in the wrapper of
 * its collection, a remove button in each item.
 */
export interface CollectionButtonSelectors {
    add: string
    remove: string
}

export const DEFAULT_BUTTON_SELECTORS: CollectionButtonSelectors = {
    add: '.add-collection',
    remove: '.remove-collection',
}

/**
 * The ids of the {@link ServiceMap} entries that are a {@link CollectionManager}.
 */
export type CollectionManagerId = {
    [K in keyof ServiceMap & string]: ServiceMap[K] extends CollectionManager ? K : never
}[keyof ServiceMap & string]

/**
 * Hands the add and remove buttons to the {@link CollectionManager} service
 * registered as `serviceId`, read from the app on the first click: the manager
 * is only built on the pages where a collection is used.
 *
 *     new App({ listeners: [collectionListener('collections')] })
 *
 * A remove button's click does not bubble, so a row's own click handlers
 * (an accordion header…) never see it.
 */
export function collectionListener(
    serviceId: CollectionManagerId,
    selectors: Partial<CollectionButtonSelectors> = {}
): Listener<HTMLElement> {
    const { add, remove } = { ...DEFAULT_BUTTON_SELECTORS, ...selectors }

    return {
        selector: `${add}, ${remove}`,
        connect: (button, { app }) =>
            on(button, 'click', (event) => {
                event.preventDefault()
                // The id is typed against the ServiceMap: its entry is a CollectionManager
                const collections = app.get(serviceId) as CollectionManager

                if (button.matches(remove)) {
                    event.stopPropagation()
                    collections
                        .remove(button)
                        .catch((error: unknown) => console.error('Failed to remove collection item', error))
                    return
                }

                try {
                    collections.addFrom(button)
                } catch (error) {
                    console.error('Failed to add collection item', error)
                }
            }),
    }
}
