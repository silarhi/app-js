/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { toggle } from '../css'
import { byId, findAll, on } from '../dom'
import type { Listener } from '../types'

export interface PasswordToggleOptions {
    /** Default `[data-password-toggle]`. */
    selector?: string
}

/**
 * The show / hide button of a password field. The field is the one its
 * `aria-controls` names, else the input of its closest ancestor holding one
 * (its input group, however deep the button sits).
 *
 * Each click flips the field's type and the button's `aria-pressed`, takes
 * `data-label-hide` / `data-label-show` as its `aria-label` (and `title`, if
 * it has one), and shows the `[data-password-toggle-icon="hide"]` or `="show"`
 * icon of the action a click now does.
 *
 * The password is hidden again before the form sends (a text field would let
 * the browser keep it in its form history) and when the button is unmounted,
 * so Turbo's page cache never holds it in clear.
 */
export function passwordToggle({
    selector = '[data-password-toggle]',
}: PasswordToggleOptions = {}): Listener<HTMLElement> {
    return {
        selector,
        connect(button) {
            const controls = button.getAttribute('aria-controls')
            const input = controls ? byId(controls, HTMLInputElement) : fieldNear(button)
            if (!input) {
                return undefined
            }

            const show = (shown: boolean) => {
                input.type = shown ? 'text' : 'password'
                button.setAttribute('aria-pressed', String(shown))

                const label = shown ? button.dataset.labelHide : button.dataset.labelShow
                if (label) {
                    button.setAttribute('aria-label', label)
                    if (button.title) {
                        button.title = label
                    }
                }

                for (const icon of findAll('[data-password-toggle-icon]', button)) {
                    toggle(icon, icon.dataset.passwordToggleIcon === (shown ? 'hide' : 'show'))
                }
            }

            const cleanups = [
                on(button, 'click', () => show(input.type === 'password')),
                ...(input.form ? [on(input.form, 'submit', () => show(false))] : []),
            ]

            return () => {
                for (const cleanup of cleanups) {
                    cleanup()
                }
                show(false)
            }
        },
    }
}

/** The first visible input of the closest ancestor holding one: the button may sit deep in an input group. */
function fieldNear(button: HTMLElement): HTMLInputElement | null {
    for (let parent = button.parentElement; parent; parent = parent.parentElement) {
        const input = parent.querySelector<HTMLInputElement>('input:not([type="hidden"])')
        if (input) {
            return input
        }
    }

    return null
}
