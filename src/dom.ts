/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { Cleanup } from './types'

/**
 * Like `querySelectorAll`, but also includes `root` itself when it matches.
 *
 * A driver may hand `App.mount()` a node that IS the match (a Turbo Stream
 * `replace` target, a re-rendered frame): a descendants-only query misses it.
 */
export function findAllSelf<E extends Element = Element>(selector: string, root: ParentNode = document): E[] {
    const found = [...root.querySelectorAll<E>(selector)]
    if (root instanceof Element && root.matches(selector)) {
        found.unshift(root as E)
    }

    return found
}

/**
 * `addEventListener` returning its own removal, to hand straight back as a
 * listener cleanup: `connect: (el) => on(el, 'click', handler)`.
 */
export function on<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions
): Cleanup
export function on(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
): Cleanup
export function on(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
): Cleanup {
    target.addEventListener(type, handler, options)

    return () => target.removeEventListener(type, handler, options)
}
