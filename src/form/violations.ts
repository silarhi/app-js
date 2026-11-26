/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { FormViolation } from '../http'
import type { Cleanup } from '../types'
import type { FormView } from './FormView'

export interface ViolationsOptions {
    /**
     * Where the errors of the form itself go. Defaults to the form's element
     * (the `<div id="user">` Symfony wraps its fields in), else the `<form>` of
     * its fields.
     */
    container?: Element
}

/**
 * Shows the errors a form was refused with (`violationsOf(error)`) through
 * the `showErrors` part of each field and the `showFormErrors` part of the
 * form: by default as Symfony's Bootstrap 5 theme renders them, `is-invalid`
 * on the controls of a field and an `invalid-feedback` message after it, the
 * errors of the form itself as `alert`s first in it.
 *
 *     try {
 *         await postForm(element.action, element)
 *     } catch (error) {
 *         clearViolations = showViolations(formView(element), violationsOf(error))
 *     }
 *
 * A path that is no longer rendered goes with the errors of the form. A field
 * edited again drops its errors; the returned cleanup removes all of them,
 * before the next submission shows its own.
 */
export function showViolations<S>(
    form: FormView<S>,
    violations: readonly FormViolation[],
    { container }: ViolationsOptions = {}
): Cleanup {
    const root = form as unknown as FormView
    const messages = new Map<FormView, string[]>()
    const formMessages: string[] = []
    for (const { path, message } of violations) {
        const node = path === '' ? null : root.find(path)
        if (node) {
            messages.set(node, [...(messages.get(node) ?? []), message])
        } else {
            formMessages.push(message)
        }
    }

    const cleanups: Cleanup[] = []
    for (const [node, nodeMessages] of messages) {
        const cleanup = showFieldErrors(node, nodeMessages)
        if (cleanup) {
            cleanups.push(cleanup)
        } else {
            formMessages.push(...nodeMessages)
        }
    }

    if (formMessages.length > 0) {
        cleanups.push(root.field().showFormErrors(formMessages, container ?? formElementOf(root)))
    }

    return () => {
        for (const cleanup of cleanups.splice(0)) {
            cleanup()
        }
    }
}

/**
 * Shows the errors of a field until it is edited or cleaned up; null when it has nowhere to show them.
 */
function showFieldErrors(node: FormView, messages: string[]): Cleanup | null {
    const field = node.field()
    const remove = field.showErrors(messages)
    if (!remove) {
        return null
    }

    const removals: Cleanup[] = []
    let shown = true
    const clear = (): void => {
        for (const removal of removals.splice(0)) {
            removal()
        }

        // Once: edited then cleaned up, it must not undo what a later submission showed
        if (shown) {
            shown = false
            remove()
        }
    }
    removals.push(field.on('input', clear), field.on('change', clear))

    return clear
}

/** The form's own element, else the `<form>` of the first control among its fields. */
function formElementOf(form: FormView): Element | null {
    const element = form.element
    if (element) {
        return element
    }

    const pending: FormView[] = [form]
    for (let node = pending.shift(); node; node = pending.shift()) {
        const control = node.inputs[0]
        if (control?.form) {
            return control.form
        }

        pending.push(...node.children)
    }

    return null
}
