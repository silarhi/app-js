/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { byId } from '../dom'
import { closest, hint } from '../suggest'
import { FieldNotFoundError } from './errors'
import { Field, type FieldOptions } from './Field'
import { type FormControl, isControl, radioGroup } from './values'

export interface FormViewOptions {
    /** Where ids and names are looked up. Defaults to the document, or to the `<form>` given to `formView()`. */
    root?: ParentNode
    /** Handed to every {@link Field} from `field()`. */
    field?: FieldOptions
}

/**
 * One node of a rendered Symfony form, read live from the DOM: the root form,
 * an embedded form, a collection or its items, an expanded choice, a field.
 * It only navigates: what a page does with a field goes through
 * {@link Field}, from `field()`.
 *
 * Nodes are addressed by path (`form.get('address.city')`, `phones.2.number`).
 * Symfony builds every id from the path (`user_address_city`) and every name
 * attribute too (`user[address][city]`), so a lookup never parses an id back
 * into a path, which `_` in field names would make ambiguous. Nothing is
 * cached but the nodes themselves: items added by `CollectionManager` or a
 * Turbo Stream are found right away.
 */
export class FormView {
    readonly id: string
    /** The name attribute prefix: `user[address]`. */
    readonly fullName: string
    /** Dot path from the root: `address.city`, `''` for the root. */
    readonly path: string
    readonly parent: FormView | null
    readonly #options: FormViewOptions
    readonly #children = new Map<string, FormView>()
    /** The element a node was built from, for one the id cannot find. */
    #anchor: HTMLElement | null = null
    #field?: Field

    constructor(
        id: string,
        fullName: string,
        options: FormViewOptions = {},
        parent: FormView | null = null,
        path = ''
    ) {
        this.id = id
        this.fullName = fullName
        this.#options = options
        this.parent = parent
        this.path = path
    }

    /**
     * A node from an element: a control, or a container whose name prefix is
     * read from its prototype or its first field.
     */
    static fromElement(element: Element, options: FormViewOptions = {}): FormView {
        const fullName = isControl(element) ? element.name.replace(/\[\]$/, '') : containerName(element)
        const view = new FormView(element.id, fullName, options)
        view.#anchor = element as HTMLElement

        return view
    }

    get name(): string {
        return this.path.split('.').pop() ?? ''
    }

    get root(): FormView {
        return this.parent ? this.parent.root : this
    }

    get element(): HTMLElement | null {
        return (this.id ? byId(this.id, this.#scope()) : null) ?? this.#anchor
    }

    /**
     * The node at `path`, below this one. Throws on a missing field, with the
     * closest existing names.
     */
    get(path: string): FormView {
        let node: FormView = this
        for (const segment of path.split('.').filter(Boolean)) {
            const child = node.#child(segment)
            if (!child.#exists()) {
                const suggestions = closest(
                    segment,
                    node.children.map((sibling) => sibling.name)
                )
                throw new FieldNotFoundError(
                    `No field "${segment}" in "${node.fullName || node.id || 'form'}".${hint(suggestions)}`,
                    child.path,
                    suggestions
                )
            }
            node = child
        }

        return node
    }

    has(path: string): boolean {
        let node: FormView = this
        for (const segment of path.split('.').filter(Boolean)) {
            node = node.#child(segment)
            if (!node.#exists()) {
                return false
            }
        }

        return true
    }

    /**
     * The rendered children, in document order: fields of a form, items of a
     * collection, options of an expanded choice.
     */
    get children(): FormView[] {
        const names = new Set<string>()
        for (const control of this.#scope().querySelectorAll(this.#namedBelow())) {
            const segment = this.#segmentOf(control)
            if (segment) {
                names.add(segment)
            }
        }

        // Expanded choices share one name: their options are told apart by id
        for (const input of this.inputs) {
            if (input !== this.element && input.id.startsWith(`${this.id}_`)) {
                names.add(input.id.slice(this.id.length + 1))
            }
        }

        return [...names].map((segment) => this.#child(segment))
    }

    /**
     * The direct child holding `element`, or being it, read from the name of
     * a control inside: which item of a collection a row is.
     */
    childOf(element: Element): FormView | null {
        const selector = this.#namedBelow()
        const control = element.matches(selector) ? element : element.querySelector(selector)
        const segment = control ? this.#segmentOf(control) : ''

        return segment ? this.#child(segment) : null
    }

    /**
     * The controls holding this node's value: the control itself, a whole
     * radio group, or the options of an expanded choice. Empty for a form.
     */
    get inputs(): FormControl[] {
        const element = this.element
        if (isControl(element)) {
            return element.type === 'radio' ? radioGroup(element as HTMLInputElement, this.#scope()) : [element]
        }

        return this.fullName ? this.#controlsNamed(this.fullName, this.#scope()) : []
    }

    /**
     * The {@link Field} at `path` (this node by default): value, required,
     * disabled, visibility. It follows the DOM like the node does.
     */
    field(path = ''): Field {
        const node = this.get(path)
        node.#field ??= new Field({ element: () => node.element, inputs: () => node.inputs }, node.#options.field)

        return node.#field
    }

    #child(segment: string): FormView {
        let child = this.#children.get(segment)
        if (!child) {
            child = new FormView(
                this.id ? `${this.id}_${segment}` : segment,
                this.fullName ? `${this.fullName}[${segment}]` : segment,
                this.#options,
                this,
                this.path ? `${this.path}.${segment}` : segment
            )
            this.#children.set(segment, child)
        }

        return child
    }

    /**
     * Rendered as an element, as controls, or as descendants only (an embedded
     * form rendered without its wrapper).
     */
    #exists(): boolean {
        const scope = this.#scope()

        return (
            this.element !== null ||
            this.inputs.length > 0 ||
            (this.id !== '' && scope.querySelector(`[id^="${this.id}_"]`) !== null) ||
            (this.fullName !== '' && scope.querySelector(`[name^="${this.fullName}["]`) !== null)
        )
    }

    /** Controls named below this node: `user[address][…]`, or any for an unnamed root. */
    #namedBelow(): string {
        return this.fullName ? `[name^="${this.fullName}["]` : '[name]'
    }

    /** The child segment in a control's name: `user[address][city]` → `address` under `user`. */
    #segmentOf(control: Element): string {
        const prefix = this.fullName ? `${this.fullName}[` : ''

        return (control.getAttribute('name') ?? '').slice(prefix.length).split(/[[\]]/)[0]
    }

    #controlsNamed(name: string, scope: ParentNode): FormControl[] {
        return [...scope.querySelectorAll<FormControl>(`[name="${name}"], [name="${name}[]"]`)].filter(isControl)
    }

    #scope(): ParentNode {
        return this.#options.root ?? document
    }
}

/**
 * The root of a rendered form: a `<form>` element, any container, or the
 * form's id (Symfony names a root form after its id: `user`).
 */
export function formView(root: string | Element, options: FormViewOptions = {}): FormView {
    if (typeof root === 'string') {
        return new FormView(root, root, options)
    }

    if (root instanceof HTMLFormElement) {
        const name = root.getAttribute('name') ?? ''
        return new FormView(name, name, { root, ...options })
    }

    return FormView.fromElement(root, options)
}

/**
 * The name prefix of a container: from its prototype (`user[phones][__name__]…`),
 * else from a field whose id continues the container's.
 */
function containerName(container: Element): string {
    if (container instanceof HTMLElement && container.dataset.prototype) {
        const placeholder = `[${container.dataset.prototypeName || '__name__'}]`
        const name = /name="([^"]+)"/.exec(container.dataset.prototype)?.[1] ?? ''
        const at = name.indexOf(placeholder)
        if (at > 0) {
            return name.slice(0, at)
        }
    }

    if (!container.id) {
        return ''
    }

    for (const control of container.querySelectorAll(`[id^="${container.id}_"][name]`)) {
        const segments = (control.getAttribute('name') ?? '').replace(/\]/g, '').split('[').filter(Boolean)
        const rest = control.id.slice(container.id.length + 1)
        // The id continues the container's with the last segments joined by `_`
        for (let start = segments.length - 1; start > 0; start--) {
            if (segments.slice(start).join('_') === rest) {
                return `${segments[0]}${segments
                    .slice(1, start)
                    .map((segment) => `[${segment}]`)
                    .join('')}`
            }
        }
    }

    return ''
}
