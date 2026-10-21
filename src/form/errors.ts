/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/**
 * A path or id that matches no rendered field. `suggestions` lists the
 * closest names that do exist, so an optional field can be told apart from a
 * typo:
 *
 *     try {
 *         form.field('siren').show()
 *     } catch (error) {
 *         if (!(error instanceof FieldNotFoundError)) throw error
 *     }
 */
export class FieldNotFoundError extends ReferenceError {
    override readonly name = 'FieldNotFoundError'
    /** The path (or id) that was asked for. */
    readonly path: string
    readonly suggestions: string[]

    constructor(message: string, path: string, suggestions: string[] = []) {
        super(message)
        this.path = path
        this.suggestions = suggestions
    }
}

/**
 * A {@link FormDefinition} rule whose source or target cannot be resolved.
 * `cause` is the underlying error, often a {@link FieldNotFoundError}.
 */
export class FormRuleError extends Error {
    override readonly name = 'FormRuleError'
    /** 1-based, in declaration order. */
    readonly rule: number
    /** `source`, or the effect whose target failed (`show`, `require`…). */
    readonly role: string
    readonly cause: unknown

    constructor(message: string, rule: number, role: string, cause: unknown) {
        super(message)
        this.rule = rule
        this.role = role
        this.cause = cause
    }
}
