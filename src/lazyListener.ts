/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { LazyListener, Listener, ListenerLoader } from './types'

/**
 * Listener whose code ships in its own chunk: `selector` stays in the entry,
 * the chunk is imported on the first matching element only — the chunk keeps
 * its heavy imports at the top and default-exports `defineLazyListener({ connect })`.
 *
 *     lazyListener('[data-datepicker]', () => import('./listeners/datepicker'))
 *
 * The chunk is imported once (concurrent connects share it, a failed import is
 * retried on the next connect), then its default-exported listener connects.
 */
export function lazyListener<E extends Element = Element>(selector: string, loader: ListenerLoader<E>): Listener<E> {
    let pending: Promise<LazyListener<E>> | undefined

    const load = (): Promise<LazyListener<E>> => {
        if (!pending) {
            pending = loader().then(({ default: listener }) => {
                if (typeof listener?.connect !== 'function') {
                    throw new TypeError(`Listener chunk for "${selector}" has no default-exported listener.`)
                }

                return listener
            })
            pending.catch(() => {
                pending = undefined
            })
        }

        return pending
    }

    return {
        selector,
        async connect(element, context) {
            const listener = await load()

            return listener.connect(element, context)
        },
    }
}
