/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { Cleanup } from '../types'
import {
    bindingOf,
    type FieldBehavior,
    getFieldDefaults,
    type PartName,
    type PartParams,
    type PartResult,
} from './behavior'
import { nativeBehavior } from './nativeBehavior'
import { type FieldValue, type FormControl, isChoice, isControl, radioGroup } from './values'

export interface FieldOptions {
    /** The field level: parts that win over the element, the app and native ones. */
    behavior?: FieldBehavior
}

/**
 * Where a field's elements come from: a control, a container of controls (an
 * expanded choice), explicit inputs, or resolvers read on every access, so
 * the field follows DOM changes.
 */
export type FieldSource = Element | FormControl[] | { element: () => Element | null; inputs: () => FormControl[] }

/**
 * One form field and what a page does with it: read and write its value,
 * require, disable, show or hide it, listen to it. It stands on its own
 * (`new Field(element)`) and backs every `FormView` node (`form.field('city')`).
 *
 * Every operation is a {@link FieldBehavior} part, resolved on each call
 * through the field, its element's binding, the app defaults and the native
 * behavior.
 */
export class Field {
    readonly #element: () => Element | null
    readonly #inputs: () => FormControl[]
    readonly #behavior: FieldBehavior | undefined

    constructor(source: FieldSource, { behavior }: FieldOptions = {}) {
        this.#behavior = behavior

        if (Array.isArray(source)) {
            const inputs = [...source]
            this.#element = () => (inputs.length === 1 ? inputs[0] : null)
            this.#inputs = () => inputs
        } else if (source instanceof Element) {
            this.#element = () => source
            this.#inputs = () => controlsOf(source)
        } else {
            this.#element = source.element
            this.#inputs = source.inputs
        }
    }

    /** The control itself, or the container of an expanded choice. */
    get element(): Element | null {
        return this.#element()
    }

    /** The controls holding the value: one control, a radio group, the options of an expanded choice. */
    get inputs(): FormControl[] {
        return this.#inputs()
    }

    /** The behavior bound to the field's element or first input with `bindField()`, if any. */
    get binding(): FieldBehavior | undefined {
        return bindingOf(this.element, this.inputs[0])
    }

    /** Several options, or options under a container: read as one value. */
    get expanded(): boolean {
        const inputs = this.inputs

        return isChoice(inputs[0]) && (inputs.length > 1 || inputs[0] !== this.element)
    }

    get value(): FieldValue {
        return this.#run('getValue', {})
    }

    /**
     * Write the value, then fire `input` and `change` on what it changed, so
     * rules and listeners follow as they would after a user edit. `silent`
     * skips the notification.
     */
    setValue(value: FieldValue | number, { silent = false }: { silent?: boolean } = {}): void {
        this.#run('setValue', { value, silent })
    }

    empty(options: { silent?: boolean } = {}): void {
        this.setValue(null, options)
    }

    /** The block shown/hidden with the field, holding its label; `null` when there is none. */
    get group(): Element | null {
        return this.#run('group', {})
    }

    /**
     * {@link group}, which must exist: what showing or hiding acts on.
     */
    get container(): Element {
        const group = this.group
        if (!group) {
            throw new Error(`Unable to find the group of field "${describe(this.element ?? this.inputs[0])}".`)
        }

        return group
    }

    get label(): Element | null {
        return this.#run('label', {})
    }

    /** Required on the control, or on the group of an expanded multiple choice. */
    get required(): boolean {
        return this.#run('isRequired', {})
    }

    setRequired(required: boolean): void {
        this.#run('setRequired', { required })

        const label = this.label
        if (label) {
            this.#run('markRequired', { label, required })
        }
    }

    get disabled(): boolean {
        return this.#run('isDisabled', {})
    }

    setDisabled(disabled: boolean): void {
        this.#run('setDisabled', { disabled })
    }

    /**
     * Show or hide the field's group, or with `'self'` the element itself (a
     * block inside a group).
     */
    setVisible(visible: boolean, scope: 'group' | 'self' = 'group'): void {
        const element = scope === 'self' ? this.element : this.container
        if (!element) {
            throw new Error('The field has no element to show or hide.')
        }

        this.#run('setVisible', { element, visible })
    }

    show(): void {
        this.setVisible(true)
    }

    hide(): void {
        this.setVisible(false)
    }

    /**
     * Listen to the field (`change`…); returns the removal, ready to be a
     * cleanup.
     */
    on(type: string, handler: (event: Event) => void): Cleanup {
        return this.#run('on', { type, handler })
    }

    onChange(handler: (event: Event) => void): Cleanup {
        return this.on('change', handler)
    }

    /**
     * Run one part through the levels: the first that implements it answers,
     * and its `next()` hands over to the level below. The only place a field
     * chooses between them.
     */
    #run<K extends PartName>(name: K, params: PartParams<K>): PartResult<K> {
        const levels = [this.#behavior, this.binding, ...getFieldDefaults(), nativeBehavior]
        const step = (from: number): PartResult<K> => {
            for (let index = from; index < levels.length; index++) {
                const level = levels[index]
                const part = level?.[name] as ((context: object) => PartResult<K>) | undefined
                if (part) {
                    return part.call(level, { ...params, field: this, next: () => step(index + 1) })
                }
            }

            // The native level implements every part
            throw new Error(`No level implements the "${name}" part.`)
        }

        return step(0)
    }
}

/**
 * A control and, for a radio, its whole group; or the controls a container holds.
 */
function controlsOf(element: Element): FormControl[] {
    if (isControl(element)) {
        return element.type === 'radio' ? radioGroup(element as HTMLInputElement) : [element]
    }

    return [...element.querySelectorAll<FormControl>('input, select, textarea')]
}

function describe(element: Element | undefined): string {
    return element?.id || (element as FormControl | undefined)?.name || element?.tagName || 'field'
}
