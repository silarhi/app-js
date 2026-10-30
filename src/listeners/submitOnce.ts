/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { on } from '../dom'
import type { Listener } from '../types'

export interface SubmitOnceOptions {
    /** Default `form[data-submit-once]`. */
    selector?: string
}

type SubmitButton = HTMLButtonElement | HTMLInputElement

/**
 * Disable the submit buttons of a form while it submits, so a second click
 * does not send it twice. The form gets `aria-busy="true"` meanwhile, for a
 * spinner to hang on.
 *
 * The buttons come back after a Turbo submission (`turbo:submit-end`), when
 * the browser restores the page from its back/forward cache, and when the
 * form is unmounted. A submission a handler cancelled (validation, a confirm
 * dialog) disables nothing.
 */
export function submitOnce({ selector = 'form[data-submit-once]' }: SubmitOnceOptions = {}): Listener<HTMLFormElement> {
    return {
        selector,
        connect(form) {
            let locked: SubmitButton[] = []
            let timer: ReturnType<typeof setTimeout> | undefined

            const lock = () => {
                if (locked.length > 0) {
                    return
                }
                locked = submitButtons(form).filter((button) => !button.disabled)
                for (const button of locked) {
                    button.disabled = true
                }
                form.setAttribute('aria-busy', 'true')
            }

            const release = () => {
                clearTimeout(timer)
                for (const button of locked) {
                    button.disabled = false
                }
                locked = []
                form.removeAttribute('aria-busy')
            }

            // Once every handler ran: the submitter is still sent (the browser
            // reads the form when the event ends), and a cancelled submission is
            // known. Turbo cancels the ones it takes over, and locks on its own
            // turbo:submit-start below.
            const onSubmit = (event: SubmitEvent) => {
                timer = setTimeout(() => {
                    if (!event.defaultPrevented) {
                        lock()
                    }
                })
            }

            const cleanups = [
                on(form, 'submit', onSubmit),
                on(form, 'turbo:submit-start', lock),
                on(form, 'turbo:submit-end', release),
                on(window, 'pageshow', release),
            ]

            return () => {
                for (const cleanup of cleanups) {
                    cleanup()
                }
                release()
            }
        },
    }
}

function submitButtons(form: HTMLFormElement): SubmitButton[] {
    return [...form.elements].filter(
        (element): element is SubmitButton =>
            (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) &&
            (element.type === 'submit' || element.type === 'image')
    )
}
