/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { toggle } from '../css'
import { findAll, on } from '../dom'
import type { Listener } from '../types'

export interface CheckAllOptions {
    /** The container, default `[data-check-all]`. */
    selector?: string
    /** The checkboxes that check every item, default `[data-check-all-master]`. */
    master?: string
    /** The item checkboxes, default `[data-check-all-item]`. */
    item?: string
    /** What shows once an item is checked (a bulk delete form…), default `[data-check-all-action]`. */
    action?: string
}

/**
 * Keep the master checkboxes, the item checkboxes and the actions of a
 * container in sync: a master checks or unchecks every item, and shows as
 * indeterminate when only some are; the actions show once an item is checked
 * (with the app-wide hidden class, see `setHiddenClass()`).
 *
 * The container listens for the changes, so items added later (a "load more")
 * count too. Disabled items are left alone.
 */
export function checkAll({
    selector = '[data-check-all]',
    master = '[data-check-all-master]',
    item = '[data-check-all-item]',
    action = '[data-check-all-action]',
}: CheckAllOptions = {}): Listener<HTMLElement> {
    return {
        selector,
        connect(container) {
            const items = () => findAll<HTMLInputElement>(item, container).filter((input) => !input.disabled)

            const sync = () => {
                const all = items()
                const checked = all.filter((input) => input.checked).length
                for (const input of findAll<HTMLInputElement>(master, container)) {
                    input.checked = checked > 0 && checked === all.length
                    input.indeterminate = checked > 0 && checked < all.length
                }
                for (const element of findAll(action, container)) {
                    toggle(element, checked > 0)
                }
            }

            const onChange = (event: Event) => {
                const target = event.target
                if (!(target instanceof HTMLInputElement)) {
                    return
                }
                if (target.matches(master)) {
                    for (const input of items()) {
                        input.checked = target.checked
                    }
                } else if (!target.matches(item)) {
                    return
                }
                sync()
            }

            sync()

            return on(container, 'change', onChange)
        },
    }
}
