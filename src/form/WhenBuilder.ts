/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { ActionBuilder } from './ActionBuilder'
import type { FormDefinition } from './FormDefinition'
import type { FieldTarget, Rule } from './rules'
import type { AnyShape } from './shape'
import type { FieldValue, FormControl } from './values'

/**
 * The condition half of a rule: `definition.when('type').equals('flat')`.
 * Each predicate hands over to an {@link ActionBuilder} for the effects.
 */
export class WhenBuilder<S = AnyShape, V extends FieldValue = FieldValue> {
    readonly #definition: FormDefinition<S>
    readonly #field: FieldTarget<S>
    #extractor: Rule['extractor'] = null

    constructor(definition: FormDefinition<S>, field: FieldTarget<S>) {
        this.#definition = definition
        this.#field = field
    }

    /** Read the value from the first input through `extractor` instead. */
    select<T extends FieldValue>(extractor: (input: FormControl) => T): WhenBuilder<S, T> {
        this.#extractor = extractor
        return this as unknown as WhenBuilder<S, T>
    }

    /** Strict comparison with any of `values`. */
    equals(...values: V[]): ActionBuilder<S> {
        return this.#predicate((value) => (values as FieldValue[]).includes(value))
    }

    notEquals(...values: V[]): ActionBuilder<S> {
        return this.#predicate((value) => !(values as FieldValue[]).includes(value))
    }

    /** For array values: checkbox groups, multiple selects. */
    includes(value: ItemOf<V>): ActionBuilder<S> {
        return this.#predicate((current) => Array.isArray(current) && current.includes(value))
    }

    notIncludes(value: ItemOf<V>): ActionBuilder<S> {
        return this.#predicate((current) => !Array.isArray(current) || !current.includes(value))
    }

    isTruthy(): ActionBuilder<S> {
        return this.#predicate((value) => Boolean(value))
    }

    isFalsy(): ActionBuilder<S> {
        return this.#predicate((value) => !value)
    }

    /** For a checkbox: a field read as a `boolean`, or as any value without a shape. */
    isChecked(..._: boolean extends V ? [] : [never]): ActionBuilder<S> {
        return (this as WhenBuilder<S>).equals(true)
    }

    #predicate(test: Rule['test']): ActionBuilder<S> {
        return new ActionBuilder<S>(this.#definition, { field: this.#field, extractor: this.#extractor, test })
    }
}

/** An option of an array value: `string` for a `string[]`, nothing for a single value. */
type ItemOf<V> = V extends readonly (infer Item)[] ? Item : never
