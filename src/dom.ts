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

/**
 * Resolves once the document is parsed, right away if it already is.
 */
export function domReady(): Promise<void> {
    return new Promise((resolve) => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
        } else {
            resolve()
        }
    })
}

/**
 * The element with `id` within `scope`: `getElementById` on a document, an
 * attribute match anywhere else (fragments, scoped forms).
 */
export function byId<E extends Element = HTMLElement>(id: string, scope: ParentNode = document): E | null {
    return scope instanceof Document ? (scope.getElementById(id) as E | null) : scope.querySelector<E>(`[id="${id}"]`)
}

export function findOne<E extends Element = HTMLElement>(selector: string, root: ParentNode = document): E | null {
    return root.querySelector<E>(selector)
}

/**
 * `querySelectorAll` as an array, so results can be mapped and filtered.
 */
export function findAll<E extends Element = HTMLElement>(selector: string, root: ParentNode = document): E[] {
    return [...root.querySelectorAll<E>(selector)]
}

/**
 * Dispatch a bubbling, cancelable `CustomEvent` and return it, so callers can
 * check `defaultPrevented`.
 */
export function trigger<T = unknown>(target: EventTarget, type: string, detail?: T): CustomEvent<T> {
    const event = new CustomEvent<T>(type, { bubbles: true, cancelable: true, detail })
    target.dispatchEvent(event)

    return event
}

/**
 * Escape a value for an HTML string, as text content or a quoted attribute.
 */
export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

/**
 * Parse `html` and append its nodes to `parent`. Returns the appended
 * elements, so the caller can `app.mount()` them.
 */
export function appendHTML(parent: Element, html: string): Element[] {
    const template = document.createElement('template')
    template.innerHTML = html
    const elements = [...template.content.children]
    parent.append(template.content)

    return elements
}
