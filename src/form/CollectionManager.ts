/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { App } from '../App'
import { appendHTML, byId, on, trigger } from '../dom'
import type { Cleanup } from '../types'
import { FormView } from './FormView'
import { fillForm } from './fillForm'

/**
 * The markup contract, matching a Symfony collection form theme: a wrapper
 * holding the collection (`data-prototype`) and its add button, items with a
 * remove button each. A remove button may target another ancestor with
 * `data-item=".selector"`. The buttons themselves are the listener's, see
 * `collectionListener()`.
 */
export interface CollectionSelectors {
    collection: string
    item: string
    wrapper: string
}

export const DEFAULT_SELECTORS: CollectionSelectors = {
    collection: '.form-collection',
    item: '.collection-item',
    wrapper: '.collection-wrapper',
}

/**
 * Dispatched on the collection element, bubbling. `collection.add` fires
 * before the new item is mounted (set values, wire fields), `collection.added`
 * after. `collection.remove` is cancelable: `preventDefault()` keeps the item,
 * without asking for confirmation.
 */
export const COLLECTION_EVENTS = {
    add: 'collection.add',
    added: 'collection.added',
    remove: 'collection.remove',
    removed: 'collection.removed',
} as const

export interface CollectionItemDetail {
    collection: HTMLElement
    item: HTMLElement
    /** The item's index in the Symfony ids (`tasks_2_label` → 2). */
    index: number
}

/**
 * Asks before a removal: plug the app's dialog (SweetAlert, a Bootstrap
 * modal…) here. `message` is the remove button's `data-confirm-message`;
 * buttons without one remove right away.
 */
export type ConfirmHandler = (message: string, detail: CollectionItemDetail) => boolean | Promise<boolean>

export interface CollectionOptions {
    /** Mounts added items and unmounts removed ones. */
    app: App
    selectors?: Partial<CollectionSelectors>
    /** Defaults to `window.confirm`. */
    confirm?: ConfirmHandler
}

export interface ItemContext extends CollectionItemDetail {
    /** The item as a form node: `form.get('label').value`. */
    form: FormView
}

/** The collection element, its id, or its {@link FormView} (`form.get('phones')`). */
type CollectionRef = HTMLElement | string | FormView

/**
 * Adds and removes Symfony form collection items from their prototype and
 * keeps the App mounted on them: a service, registered like any other, whose
 * add/remove buttons `collectionListener()` hands to it. Options only plug
 * collaborators in (the app, the markup, the confirm dialog); the lifecycle is
 * reported through {@link COLLECTION_EVENTS}, and `each()` for one
 * collection's items.
 *
 *     new App({
 *         services: {
 *             collections: (container): CollectionManager =>
 *                 new CollectionManager({ app: container.get('app'), confirm: (message) => dialogs.confirm(message) }),
 *         },
 *         listeners: [collectionListener('collections')],
 *     })
 */
export class CollectionManager {
    readonly selectors: CollectionSelectors
    readonly #options: CollectionOptions
    readonly #app: App

    constructor(options: CollectionOptions) {
        this.#options = options
        this.#app = options.app
        this.selectors = { ...DEFAULT_SELECTORS, ...options.selectors }
    }

    /**
     * Append an item rendered from the collection's prototype, optionally
     * filled with `values` keyed like the item's fields (see {@link fillForm}):
     *
     *     collections.add(form.get('phones'), { number: '0102', type: { id: 3 } })
     */
    add(collection: CollectionRef, values: Record<string, unknown> = {}): HTMLElement {
        const element = this.#resolve(collection)
        const view = this.#view(collection, element)
        const item = this.#append(element, view, values)
        const detail = this.#detail(element, item, view)

        trigger(element, COLLECTION_EVENTS.add, detail)
        this.#app.mount(item)
        trigger(element, COLLECTION_EVENTS.added, detail)

        return item
    }

    /**
     * Append an item to the collection next to `button`: the one its wrapper
     * holds, as an add button placed after the collection finds it.
     */
    addFrom(button: Element, values: Record<string, unknown> = {}): HTMLElement {
        const collection = button.closest(this.selectors.wrapper)?.querySelector<HTMLElement>(this.selectors.collection)
        if (!collection) {
            throw new Error(`No "${this.selectors.collection}" found in the "${this.selectors.wrapper}" of the button.`)
        }

        return this.add(collection, values)
    }

    /**
     * Remove the item holding `target` (a remove button or the item itself).
     * Resolves to whether it was removed.
     */
    async remove(target: HTMLElement, { confirm = true }: { confirm?: boolean } = {}): Promise<boolean> {
        const item = target.closest<HTMLElement>(target.dataset.item || this.selectors.item)
        const collection = item?.parentElement?.closest<HTMLElement>(this.selectors.collection)
        if (!item || !collection) {
            return false
        }

        const detail = this.#detail(collection, item, this.#view(collection, collection))
        if (trigger(collection, COLLECTION_EVENTS.remove, detail).defaultPrevented) {
            return false
        }
        if (confirm && !(await this.#confirmRemoval(target, detail))) {
            return false
        }

        this.#app.unmount(item)
        item.remove()
        trigger(collection, COLLECTION_EVENTS.removed, detail)

        return true
    }

    /**
     * Remove every item, without confirmation.
     */
    async clear(collection: CollectionRef): Promise<void> {
        for (const item of this.items(collection)) {
            await this.remove(item, { confirm: false })
        }
    }

    /**
     * The collection's own items (nested collections excluded).
     */
    items(collection: CollectionRef): HTMLElement[] {
        const element = this.#resolve(collection)

        return [...element.children].filter((child): child is HTMLElement => child.matches(this.selectors.item))
    }

    /**
     * Run `handler` for every item, the existing ones now and the added ones
     * on `collection.add`. Returns the unsubscription.
     */
    each(collection: CollectionRef, handler: (context: ItemContext) => void): Cleanup {
        const element = this.#resolve(collection)
        const view = this.#view(collection, element)
        const run = (detail: CollectionItemDetail): void => handler({ ...detail, form: view.get(String(detail.index)) })

        for (const item of this.items(element)) {
            run(this.#detail(element, item, view))
        }

        return on(element, COLLECTION_EVENTS.add, (event) => {
            // Nested collections bubble their own events up
            if (event.target === element) {
                run((event as CustomEvent<CollectionItemDetail>).detail)
            }
        })
    }

    /**
     * Ask only when the remove button carries `data-confirm-message`, through
     * the `confirm` option or `window.confirm`.
     */
    async #confirmRemoval(target: HTMLElement, detail: CollectionItemDetail): Promise<boolean> {
        const message = target.dataset.confirmMessage
        if (message === undefined) {
            return true
        }

        const confirm = this.#options.confirm ?? ((text: string) => window.confirm(text))

        return confirm(message, detail)
    }

    /**
     * Render the prototype with the next index, then keep the following one in
     * `data-index`.
     */
    #append(collection: HTMLElement, view: FormView, values: Record<string, unknown>): HTMLElement {
        const prototype = collection.dataset.prototype
        if (prototype === undefined) {
            throw new Error('The collection has no "data-prototype" attribute.')
        }

        const index = this.#nextIndex(collection, view)
        collection.dataset.index = String(index + 1)
        const [item] = appendHTML(
            collection,
            prototype.replaceAll(collection.dataset.prototypeName || '__name__', String(index))
        ) as HTMLElement[]
        item.dataset.collectionIndex = String(index)
        if (Object.keys(values).length > 0) {
            // Nested items are silent: the outer item's events cover them
            fillForm(view.get(String(index)), values, (nested, itemValues) => {
                this.#append(nested.element as HTMLElement, nested, itemValues)
            })
        }

        return item
    }

    /**
     * `data-index` when the template renders it, else one past the highest
     * item index the collection's {@link FormView} sees. Counting children
     * would collide once keys have gaps: items 0 and 2 left after a removal,
     * or a submitted form re-rendered with its original keys.
     */
    #nextIndex(collection: HTMLElement, view: FormView): number {
        const stored = Number.parseInt(collection.dataset.index ?? '', 10)
        if (!Number.isNaN(stored)) {
            return stored
        }

        // Without a name to read the items by, counting is all there is
        if (!view.fullName) {
            return collection.children.length
        }

        const indexes = view.children
            .map((child) => child.name)
            .filter(isIndex)
            .map(Number)

        return indexes.length > 0 ? Math.max(...indexes) + 1 : 0
    }

    /**
     * The collection's node: the one given, or one read from its element.
     */
    #view(ref: CollectionRef, element: HTMLElement): FormView {
        return ref instanceof FormView ? ref : FormView.fromElement(element)
    }

    #resolve(ref: CollectionRef): HTMLElement {
        if (ref instanceof FormView) {
            const element = ref.element
            if (!element) {
                throw new Error(`The collection "${ref.path || ref.id}" is not rendered.`)
            }
            return element
        }
        if (typeof ref !== 'string') {
            return ref
        }

        const element = byId(ref)
        if (!element) {
            throw new Error(`Unable to find an element with id "${ref}".`)
        }

        return element
    }

    /**
     * The item's index as its node name in the collection's {@link FormView},
     * so server-rendered items with gaps (0, 2) keep theirs; its position only
     * when no field tells.
     */
    #detail(collection: HTMLElement, item: HTMLElement, view: FormView): CollectionItemDetail {
        const name = item.dataset.collectionIndex ?? view.childOf(item)?.name
        const index = name !== undefined && isIndex(name) ? Number(name) : this.items(collection).indexOf(item)

        return { collection, item, index }
    }
}

const isIndex = (name: string): boolean => /^\d+$/.test(name)
