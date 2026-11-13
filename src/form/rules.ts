/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { Field } from './Field'
import type { FormView } from './FormView'
import type { AnyShape, FormFieldValue, FormNodeAt, RequiredFormPath } from './shape'
import type { FieldValue, FormControl } from './values'

/**
 * What a rule points at: a path of the definition's `form` (`address.city`),
 * or an element id without one; an element, a {@link Field}, a
 * {@link FormView} node, or a {@link block} wrapper. With a typed `form`,
 * only the paths it always renders: a field that may be missing goes
 * through `form.find()`.
 */
export type FieldTarget<S = AnyShape> = RequiredFormPath<S> | Element | Field | FormView | BlockTarget<S>

export interface BlockTarget<S = AnyShape> {
    block: Exclude<FieldTarget<S>, BlockTarget<S>>
}

/**
 * Show/hide the element itself instead of its form group ancestor.
 */
export const block = <const T extends Exclude<FieldTarget, BlockTarget>>(target: T): { block: T } => ({ block: target })

export const isBlock = (target: FieldTarget): target is BlockTarget =>
    typeof target === 'object' && target !== null && 'block' in target

/**
 * The value a rule reads from its source: the one the shape names for a
 * path or a node, a `Field`'s own, any {@link FieldValue} otherwise.
 */
export type TargetValue<S, T> = T extends string
    ? FormFieldValue<FormNodeAt<S, T>>
    : T extends Field<Element, infer V>
      ? V
      : T extends FormView<infer N>
        ? FormFieldValue<N>
        : FieldValue

export type Effect = 'show' | 'hide' | 'require' | 'disable' | 'empty'

/**
 * One declared rule: when `test` passes on the value of `field` (read through
 * `extractor` if given), apply `effect` to `target`.
 */
export interface Rule {
    field: FieldTarget
    extractor: ((input: FormControl) => FieldValue) | null
    test: (value: FieldValue) => boolean
    effect: Effect
    target: FieldTarget
}
