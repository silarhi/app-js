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
import type { AnyShape, FormChild, FormElement, FormNodeAt, FormPath, RequiredFormPath } from './shape'
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
 *
 * Given a shape (`formView<UserForm>()`, see `shape.ts`), paths are checked
 * when compiling: `get()` takes the paths always rendered, `find()` and
 * `has()` any path. Without one, every string is a path. A field typed
 * `FormField<HTMLSelectElement>` types `element` and `field().element` too.
 */
export class FormView<S = AnyShape> {
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
     * read from its prototype, its fields' ids, or the names its fields share.
     * A container's id follows its name, as Symfony builds it: a wrapper with
     * an id of its own (`rent_debits_0_amountPart_group`) still finds
     * `rent_debits_0_amountPart_amount`.
     */
    static fromElement<S = AnyShape>(element: Element, options: FormViewOptions = {}): FormView<S> {
        const control = isControl(element)
        const fullName = control ? element.name.replace(/\[\]$/, '') : containerName(element)
        const id = control || !fullName ? element.id : idOf(fullName)
        const view = new FormView<S>(id, fullName, options)
        view.#anchor = element as HTMLElement

        return view
    }

    get name(): string {
        return this.path.split('.').pop() ?? ''
    }

    get root(): FormView {
        return this.parent ? this.parent.root : this
    }

    get element(): FormElement<S> | null {
        return ((this.id ? byId(this.id, this.#scope()) : null) ?? this.#anchor) as FormElement<S> | null
    }

    /**
     * The node at `path`, below this one. Throws on a missing field, with the
     * closest existing names.
     */
    get<P extends RequiredFormPath<S>>(path: P): FormView<FormNodeAt<S, P>> {
        return this.#get(path)
    }

    /**
     * The node at `path`, or null when it is not rendered: a field that
     * depends on the form's options or data.
     */
    find<P extends FormPath<S>>(path: P): FormView<FormNodeAt<S, P>> | null {
        return this.has(path) ? this.#get(path) : null
    }

    #get(path: string): FormView {
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

    has(path: FormPath<S>): boolean {
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
    get children(): FormView<FormChild<S>>[] {
        const names = new Set<string>()
        for (const control of this.#scope().querySelectorAll(this.#namedBelow())) {
            const segment = this.#segmentOf(control)
            if (segment) {
                names.add(segment)
            }
        }

        // Expanded choices share one name: their options are told apart by id
        const element: Element | null = this.element
        for (const input of this.inputs) {
            if (input !== element && input.id.startsWith(`${this.id}_`)) {
                names.add(input.id.slice(this.id.length + 1))
            }
        }

        return [...names].map((segment) => this.#child(segment))
    }

    /**
     * The direct child holding `element`, or being it, read from the name of
     * a control inside: which item of a collection a row is.
     */
    childOf(element: Element): FormView<FormChild<S>> | null {
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
    field<P extends RequiredFormPath<S> | '' = ''>(path: P = '' as P): Field<FormElement<FormNodeAt<S, P>>> {
        const node = this.#get(path)
        node.#field ??= new Field({ element: () => node.element, inputs: () => node.inputs }, node.#options.field)

        return node.#field as Field<FormElement<FormNodeAt<S, P>>>
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
 * The root of a rendered form: a `<form>` element, the form's id (Symfony
 * names a root form after its id: `user`), or any element holding fields, read
 * as the form node they share (`.amount-part` around `rent[debits][0][amountPart][…]`).
 * An element given is also where lookups happen: the same form rendered
 * elsewhere on the page is not seen.
 */
export function formView<S = AnyShape>(root: string | Element, options: FormViewOptions = {}): FormView<S> {
    if (typeof root === 'string') {
        return new FormView<S>(root, root, options)
    }

    if (root instanceof HTMLFormElement) {
        const name = root.getAttribute('name') ?? ''
        return new FormView<S>(name, name, { root, ...options })
    }

    return FormView.fromElement<S>(root, { root, ...options })
}

/**
 * The name prefix of a container: from its prototype (`user[phones][__name__]…`),
 * else from a field whose id continues the container's, else the prefix its
 * fields' names share.
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

    if (container.id) {
        for (const control of container.querySelectorAll(`[id^="${container.id}_"][name]`)) {
            const segments = nameSegments(control.getAttribute('name') ?? '')
            const rest = control.id.slice(container.id.length + 1)
            // The id continues the container's with the last segments joined by `_`
            for (let start = segments.length - 1; start > 0; start--) {
                if (segments.slice(start).join('_') === rest) {
                    return nameOf(segments.slice(0, start))
                }
            }
        }
    }

    return sharedName(container)
}

/**
 * The parent node all the fields inside share: `rent[debits][0][amountPart]`
 * for `…[amountPart][amount]` and `…[amountPart][taxType]`. Unnamed inputs
 * (a Tom Select search box) are skipped.
 */
function sharedName(container: Element): string {
    let shared: string[] | null = null
    for (const control of container.querySelectorAll('[name]')) {
        if (!isControl(control)) {
            continue
        }

        const parents = nameSegments(control.name).slice(0, -1)
        shared = shared === null ? parents : shared.slice(0, mismatch(shared, parents))
        if (shared.length === 0) {
            return ''
        }
    }

    return shared ? nameOf(shared) : ''
}

/** `user[phones][0][number][]` → `user`, `phones`, `0`, `number`. */
function nameSegments(name: string): string[] {
    return name.replace(/\]/g, '').split('[').filter(Boolean)
}

/** `user`, `phones`, `0` → `user[phones][0]`. */
function nameOf(segments: string[]): string {
    return segments.map((segment, index) => (index ? `[${segment}]` : segment)).join('')
}

/** The first index where `a` and `b` differ. */
function mismatch(a: string[], b: string[]): number {
    let index = 0
    while (index < a.length && a[index] === b[index]) {
        index++
    }

    return index
}

/** The id Symfony gives a node: its name segments joined by `_`. */
function idOf(fullName: string): string {
    return nameSegments(fullName).join('_')
}
