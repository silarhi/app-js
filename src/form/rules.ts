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
import type { FieldValue, FormControl } from './values'

/**
 * What a rule points at: a path of the definition's `form` (`address.city`),
 * or an element id without one; an element, a {@link Field}, a
 * {@link FormView} node, or a {@link block} wrapper.
 */
export type FieldTarget = string | Element | Field | FormView | BlockTarget

export interface BlockTarget {
    block: Exclude<FieldTarget, BlockTarget>
}

/**
 * Show/hide the element itself instead of its form group ancestor.
 */
export const block = (target: Exclude<FieldTarget, BlockTarget>): FieldTarget => ({ block: target })

export const isBlock = (target: FieldTarget): target is BlockTarget =>
    typeof target === 'object' && target !== null && 'block' in target

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
