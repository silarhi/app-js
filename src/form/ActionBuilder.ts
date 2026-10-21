/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { Cleanup } from '../types'
import type { FormDefinition } from './FormDefinition'
import type { Effect, FieldTarget, Rule } from './rules'
import type { WhenBuilder } from './WhenBuilder'

/**
 * The effect half of a rule: `.show('rooms')`, `.require('date')`… Effects
 * chain on the same condition; `when()` starts the next rule and `apply()`
 * applies them all.
 */
export class ActionBuilder {
    readonly #definition: FormDefinition
    readonly #predicate: Pick<Rule, 'field' | 'extractor' | 'test'>

    constructor(definition: FormDefinition, predicate: Pick<Rule, 'field' | 'extractor' | 'test'>) {
        this.#definition = definition
        this.#predicate = predicate
    }

    show(...targets: FieldTarget[]): this {
        return this.#add('show', targets)
    }

    hide(...targets: FieldTarget[]): this {
        return this.#add('hide', targets)
    }

    require(...targets: FieldTarget[]): this {
        return this.#add('require', targets)
    }

    disable(...targets: FieldTarget[]): this {
        return this.#add('disable', targets)
    }

    /** Clear the targets while the condition holds. */
    empty(...targets: FieldTarget[]): this {
        return this.#add('empty', targets)
    }

    showAndRequire(...targets: FieldTarget[]): this {
        return this.#add('show', targets).#add('require', targets)
    }

    when(field: FieldTarget): WhenBuilder {
        return this.#definition.when(field)
    }

    apply(): Cleanup {
        return this.#definition.apply()
    }

    #add(effect: Effect, targets: FieldTarget[]): this {
        for (const target of targets) {
            this.#definition.addRule({ ...this.#predicate, effect, target })
        }
        return this
    }
}
