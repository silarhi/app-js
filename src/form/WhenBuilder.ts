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
export class WhenBuilder<S = AnyShape> {
    readonly #definition: FormDefinition<S>
    readonly #field: FieldTarget<S>
    #extractor: Rule['extractor'] = null

    constructor(definition: FormDefinition<S>, field: FieldTarget<S>) {
        this.#definition = definition
        this.#field = field
    }

    /** Read the value from the first input through `extractor` instead. */
    select(extractor: (input: FormControl) => FieldValue): this {
        this.#extractor = extractor
        return this
    }

    /** Strict comparison with any of `values`. */
    equals(...values: FieldValue[]): ActionBuilder<S> {
        return this.#predicate((value) => values.includes(value))
    }

    notEquals(...values: FieldValue[]): ActionBuilder<S> {
        return this.#predicate((value) => !values.includes(value))
    }

    /** For array values: checkbox groups, multiple selects. */
    includes(value: string): ActionBuilder<S> {
        return this.#predicate((current) => Array.isArray(current) && current.includes(value))
    }

    notIncludes(value: string): ActionBuilder<S> {
        return this.#predicate((current) => !Array.isArray(current) || !current.includes(value))
    }

    isTruthy(): ActionBuilder<S> {
        return this.#predicate((value) => Boolean(value))
    }

    isFalsy(): ActionBuilder<S> {
        return this.#predicate((value) => !value)
    }

    isChecked(): ActionBuilder<S> {
        return this.equals(true)
    }

    #predicate(test: Rule['test']): ActionBuilder<S> {
        return new ActionBuilder<S>(this.#definition, { field: this.#field, extractor: this.#extractor, test })
    }
}
