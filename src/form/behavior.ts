/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { Cleanup } from '../types'
import type { Field } from './Field'
import type { FieldValue } from './values'

/**
 * What every part receives: the field, the part's own parameters, and `next()`
 * to defer to the level below.
 */
export type Part<Params, Result> = (context: Params & { field: Field; next: () => Result }) => Result

/**
 * How a field behaves, part by part. A field resolves each part through four
 * levels, the first that implements it winning:
 *
 * 1. the field itself (`new Field(element, { behavior })`);
 * 2. its element (`bindField(element, behavior)`, from the code that enhances it);
 * 3. the app (`setFieldDefaults(...behaviors)`, at boot);
 * 4. the browser's controls and Symfony's Bootstrap markup, which implement all.
 *
 * A part can call `next()` to let the level below answer, before or after its
 * own work: an app-wide rule for date inputs only, a label marked twice.
 */
export interface FieldBehavior {
    /** The value: a boolean for a checkbox, an array for an expanded or multiple choice. */
    getValue?: Part<object, FieldValue>
    /** `null` empties. Unless `silent`, notify `input` / `change` as a user edit would. */
    setValue?: Part<{ value: FieldValue | number; silent: boolean }, void>
    isRequired?: Part<object, boolean>
    /** The control's required state; the label is `markRequired`'s. */
    setRequired?: Part<{ required: boolean }, void>
    isDisabled?: Part<object, boolean>
    setDisabled?: Part<{ disabled: boolean }, void>
    /** Listen to the field; returns the removal. */
    on?: Part<{ type: string; handler: (event: Event) => void }, Cleanup>
    /** The block shown/hidden with the field, holding its label. */
    group?: Part<object, Element | null>
    label?: Part<object, Element | null>
    setVisible?: Part<{ element: Element; visible: boolean }, void>
    /** Show on the label that the field is required. */
    markRequired?: Part<{ label: Element; required: boolean }, void>
}

export type PartName = keyof FieldBehavior
export type PartParams<K extends PartName> = Omit<Parameters<NonNullable<FieldBehavior[K]>>[0], 'field' | 'next'>
export type PartResult<K extends PartName> = ReturnType<NonNullable<FieldBehavior[K]>>

const bindings = new WeakMap<Element, FieldBehavior>()

/**
 * Hand `element` (the control, or an expanded choice's container) to a
 * behavior, from the code that enhances it. Returns the unbinding, ready to
 * join the listener's cleanup:
 *
 *     connect(select) {
 *         const ts = new TomSelect(select)
 *         const unbind = bindField(select, {
 *             getValue: () => ts.getValue(),
 *             setValue: ({ value, silent }) => ts.setValue(value ?? '', silent),
 *             setDisabled: ({ disabled }) => (disabled ? ts.disable() : ts.enable()),
 *         })
 *         return () => { unbind(); ts.destroy() }
 *     }
 */
export function bindField(element: Element, behavior: FieldBehavior): Cleanup {
    bindings.set(element, behavior)

    return () => {
        if (bindings.get(element) === behavior) {
            bindings.delete(element)
        }
    }
}

/**
 * The behavior bound to the first of `elements` that has one.
 */
export function bindingOf(...elements: Array<Element | null | undefined>): FieldBehavior | undefined {
    for (const element of elements) {
        const behavior = element ? bindings.get(element) : undefined
        if (behavior) {
            return behavior
        }
    }

    return undefined
}

let defaults: readonly FieldBehavior[] = []

/**
 * The app level: behaviors every field falls back to, first one first, read
 * on every call. Replaces the previous defaults; returns their restoration.
 *
 *     setFieldDefaults(bootstrapTheme({ hiddenClass: 'd-none' }), {
 *         getValue: ({ field, next }) => (field.element?.matches('[data-date]') ? toIso(field.element) : next()),
 *     })
 */
export function setFieldDefaults(...behaviors: FieldBehavior[]): Cleanup {
    const previous = defaults
    defaults = behaviors

    return () => {
        defaults = previous
    }
}

export function getFieldDefaults(): readonly FieldBehavior[] {
    return defaults
}
