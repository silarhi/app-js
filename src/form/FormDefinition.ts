/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { byId } from '../dom'
import type { Cleanup } from '../types'
import { FieldNotFoundError, FormRuleError } from './errors'
import { Field, type FieldOptions } from './Field'
import { FormView } from './FormView'
import { type Effect, type FieldTarget, isBlock, type Rule, type TargetValue } from './rules'
import type { AnyShape } from './shape'
import { type FormControl, isControl } from './values'
import { WhenBuilder } from './WhenBuilder'

const MAX_PASSES = 10

type Buckets = Record<Effect, Array<() => boolean>>

export interface FormDefinitionOptions<S = AnyShape> {
    /** Resolves string targets as paths of this form instead of element ids; typed, it checks them. */
    form?: FormView<S>
    /** Where ids are looked up without a `form`. */
    root?: ParentNode
    /** Handed to the fields built from ids or elements; a `form` hands its own. */
    field?: FieldOptions
}

/**
 * Declarative dependent-field rules, one statement each:
 *
 *     const definition = new FormDefinition({ form: formView(container.querySelector('form')) })
 *     definition.when('hasVAT').isChecked().showAndRequire('VATStartDate')
 *     definition.when('type').equals('flat').show('rooms')
 *     return definition.apply()
 *
 * - `.equals()` is strict; checkbox groups (array values) use `.includes()`.
 * - `.select(fn)` reads the value from the first input through `fn` instead.
 * - Rules on the same target and effect are OR-ed.
 * - A target with both `.show()` and `.hide()` rules is hidden if any hide
 *   rule matches.
 * - `.empty()` clears the target while its rule matches.
 * - A hidden target is never required; shown, it is required as its
 *   `.require()` rules say, else as it was rendered.
 * - A block holding several fields (a panel) hides them all: none is
 *   required while it is hidden, each is back as it was rendered once shown.
 *   Require its fields, not the panel.
 * - Disabling or emptying a panel goes through each of its fields, so their
 *   bindings follow. Enabled again, a field rendered disabled stays so; a
 *   field's own rules, applied after, have the last word.
 */
export class FormDefinition<S = AnyShape> {
    readonly #rules: Rule[] = []
    readonly #fields = new WeakMap<Element, Field>()
    readonly #options: FormDefinitionOptions<S>

    constructor(options: FormDefinitionOptions<S> = {}) {
        this.#options = options
    }

    /** The declared rules, in order. */
    get rules(): readonly Rule[] {
        return this.#rules
    }

    /** Starts a rule on `field`; its conditions take the values the shape names for it. */
    when<T extends FieldTarget<S>>(field: T): WhenBuilder<S, TargetValue<S, T>> {
        return new WhenBuilder<S, TargetValue<S, T>>(this, field)
    }

    /** Declare a rule directly; `when()` builds them for you. */
    addRule(rule: Rule): this {
        this.#rules.push(rule)
        return this
    }

    /**
     * Evaluate every rule now and on each change of their source fields.
     * Returns the cleanup, ready to hand back from a page initializer.
     */
    apply(): Cleanup {
        const sources = new Set<Field>()
        const targets = new Map<Field, { group?: Buckets; block?: Buckets }>()

        const panels = new Set<Field>()
        this.#rules.forEach((rule, index) => {
            const source = this.#resolveFor(rule.field, index + 1, 'source')
            sources.add(source)

            const target = this.#resolveFor(rule.target, index + 1, rule.effect)
            const kinds = targets.get(target) ?? {}
            targets.set(target, kinds)
            const kind = isBlock(rule.target) ? 'block' : 'group'
            if (kind === 'block' && isPanel(target)) {
                if (rule.effect === 'require') {
                    throw new FormRuleError(
                        `Cannot require the block of rule #${index + 1}: it holds several fields, require them instead.`,
                        index + 1,
                        rule.effect,
                        null
                    )
                }
                panels.add(target)
            }
            kinds[kind] ??= { show: [], hide: [], require: [], disable: [], empty: [] }
            kinds[kind][rule.effect].push(() =>
                rule.test(rule.extractor ? rule.extractor(source.inputs[0]) : source.value)
            )
        })

        const matches = (tests: Array<() => boolean>): boolean => tests.some((test) => test())
        // How each field was rendered (Symfony renders them required by
        // default), to give back what the rules take away. Taken before the
        // first pass; a field added to a panel later, when first seen.
        const initial = new Map<Field, { required: boolean; disabled: boolean }>()
        const rendered = (field: Field): { required: boolean; disabled: boolean } => {
            let state = initial.get(field)
            if (!state) {
                state = { required: field.required, disabled: field.disabled }
                initial.set(field, state)
            }
            return state
        }
        for (const field of targets.keys()) {
            if (panels.has(field)) {
                this.#eachPanelField(field, rendered)
            } else {
                rendered(field)
            }
        }

        // Panels first: the rules of the fields inside, applied after, have the last word
        const ordered = [...targets].sort(([a], [b]) => Number(panels.has(b)) - Number(panels.has(a)))

        const pass = (): void => {
            const hiddenPanels: Element[] = []
            for (const [field, kinds] of ordered) {
                let hidden = false
                let toggled = false
                let required: boolean | undefined
                for (const [kind, { show, hide, require, disable, empty }] of Object.entries(kinds)) {
                    if (show.length > 0 || hide.length > 0) {
                        const visible = (show.length === 0 || matches(show)) && !matches(hide)
                        field.setVisible(visible, kind === 'block' ? 'self' : 'group')
                        hidden ||= !visible
                        toggled = true
                    }
                    if (require.length > 0) {
                        required = (required ?? false) || matches(require)
                    }
                    if (disable.length > 0) {
                        const disabled = matches(disable)
                        if (panels.has(field)) {
                            // Enabled again, a field rendered disabled stays so
                            this.#eachPanelField(field, (inner) =>
                                inner.setDisabled(disabled || rendered(inner).disabled)
                            )
                        } else {
                            field.setDisabled(disabled)
                        }
                    }
                    if (matches(empty)) {
                        if (panels.has(field)) {
                            this.#eachPanelField(field, (inner) => inner.empty())
                        } else {
                            field.empty()
                        }
                    }
                }

                // A hidden field is never required: the browser would block the
                // submit on a control nobody can see
                if (panels.has(field)) {
                    if (toggled) {
                        if (hidden) {
                            hiddenPanels.push(field.element as Element)
                        }
                        // Through each field, so bindings and labels follow
                        this.#eachPanelField(field, (inner) => inner.setRequired(!hidden && rendered(inner).required))
                    }
                    continue
                }

                const anchor = field.element ?? field.inputs[0]
                hidden ||= hiddenPanels.some((panel) => anchor !== undefined && panel.contains(anchor))
                if (required !== undefined || toggled) {
                    field.setRequired(!hidden && (required ?? rendered(field).required))
                }
            }
        }

        // Emptying a field fires `change`, which may feed other rules: those
        // re-entries become extra passes instead of nested ones. Values only
        // move towards empty, so passes settle; the cap catches a behavior
        // that never does.
        let running = false
        let dirty = false
        const evaluate = (): void => {
            if (running) {
                dirty = true
                return
            }

            running = true
            try {
                let passes = 0
                do {
                    dirty = false
                    pass()
                } while (dirty && ++passes < MAX_PASSES)

                if (dirty) {
                    console.error(`Form rules did not settle after ${MAX_PASSES} passes.`)
                }
            } finally {
                running = false
            }
        }

        // Listen first: fields emptied by the first evaluation feed the rules reading them
        const removals = [...sources].map((source) => source.onChange(evaluate))
        evaluate()

        return () => {
            for (const remove of removals) {
                remove()
            }
        }
    }

    /**
     * The {@link Field} behind a target, one instance per field.
     */
    resolve(target: FieldTarget): Field {
        if (target instanceof Field) {
            return target
        }
        if (target instanceof FormView) {
            return target.field()
        }
        if (isBlock(target)) {
            return this.resolve(target.block)
        }
        if (target === undefined || target === null || target === '') {
            throw new Error('No form field given (a mistyped path or property?).')
        }
        if (typeof target === 'string' && this.#options.form) {
            return (this.#options.form as FormView).field(target)
        }

        const element = typeof target === 'string' ? this.#byId(target) : target
        let field = this.#fields.get(element)
        if (!field) {
            field = new Field(element, this.#options.field)
            this.#fields.set(element, field)
        }

        return field
    }

    /** Each field of a panel once, as the definition resolves it. */
    #eachPanelField(panel: Field, apply: (field: Field) => void): void {
        const seen = new Set<FormControl>()
        for (const control of panel.inputs) {
            if (seen.has(control)) {
                continue
            }

            // A radio's field holds its whole group
            const field = this.resolve(control)
            for (const input of field.inputs) {
                seen.add(input)
            }
            apply(field)
        }
    }

    #resolveFor(target: FieldTarget, rule: number, role: string): Field {
        try {
            const field = this.resolve(target)
            if (isBlock(target) && !field.element) {
                const name = typeof target.block === 'string' ? ` "${target.block}"` : ''
                throw new Error(`The block${name} has no element.`)
            }
            return field
        } catch (error) {
            const what = role === 'source' ? `the source of rule #${rule}` : `the "${role}" target of rule #${rule}`
            throw new FormRuleError(`Cannot resolve ${what}: ${(error as Error).message}`, rule, role, error)
        }
    }

    #byId(id: string): Element {
        const element = byId(id, this.#options.root)
        if (!element) {
            throw new FieldNotFoundError(`Unable to find an element with id "${id}".`, id)
        }

        return element
    }
}

/**
 * A block holding several fields: controls of several names. An expanded
 * choice is one field, its options share a name.
 */
function isPanel(field: Field): boolean {
    return !isControl(field.element) && new Set(field.inputs.map((input) => input.name.replace(/\[\]$/, ''))).size > 1
}
