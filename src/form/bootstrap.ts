/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { toggle } from '../css'
import type { Cleanup } from '../types'
import type { FieldBehavior } from './behavior'
import { type FormControl, isChoice, isControl } from './values'

export interface BootstrapThemeOptions {
    /** Defaults to Symfony's `.form-group` row. */
    groupSelector?: string
    /** Defaults to the app-wide one, see `setHiddenClass()`. */
    hiddenClass?: string
    requiredClass?: string
    /** Added to the controls of a field in error. */
    invalidClass?: string
    /** The class of the message under a field. */
    feedbackClass?: string
    /** The class of a message of the form itself. */
    alertClass?: string
}

type ThemeParts = 'group' | 'label' | 'setVisible' | 'markRequired' | 'showErrors' | 'showFormErrors'

/**
 * The markup parts for Symfony's Bootstrap form themes: rows in a group, a
 * single checkbox labelled by its sibling `.form-check-label`, other fields
 * by their group's `legend` / `label`, errors as the Bootstrap 5 theme
 * renders them. The native level uses the defaults; configure them for the
 * app with `setFieldDefaults(bootstrapTheme({ … }))`.
 */
export function bootstrapTheme({
    groupSelector = '.form-group',
    hiddenClass,
    requiredClass = 'required',
    invalidClass = 'is-invalid',
    feedbackClass = 'invalid-feedback d-block',
    alertClass = 'alert alert-danger d-block',
}: BootstrapThemeOptions = {}): Required<Pick<FieldBehavior, ThemeParts>> {
    return {
        group: ({ field }) => (field.element ?? field.inputs[0])?.closest(groupSelector) ?? null,
        label: ({ field }) => {
            const element = field.element
            if (element instanceof HTMLInputElement && element.type === 'checkbox') {
                return (
                    [...(element.parentElement?.children ?? [])].find(
                        (sibling) => sibling !== element && sibling.classList.contains('form-check-label')
                    ) ?? null
                )
            }

            // Through the field, so a group from another level moves the label too
            return field.group?.querySelector('legend, label') ?? null
        },
        setVisible: ({ element, visible }) => toggle(element, visible, hiddenClass),
        markRequired: ({ label, required }) => {
            label.classList.toggle(requiredClass, required)
        },
        // `is-invalid` on the controls, an `invalid-feedback` message after the field
        showErrors: ({ field, messages }) => {
            const controls = field.inputs
            const element = field.element
            const control = isControl(element) ? element : controls[controls.length - 1]
            if (!element && !control) {
                return null
            }

            const feedbacks = messages.map((message) => createMessage(message, feedbackClass))
            if (element && !isControl(element)) {
                // A container: the options of an expanded choice, an embedded form
                element.append(...feedbacks)
            } else if (control) {
                placeAfter(control, feedbacks)
            }

            // Only the classes added here are removed: a control the server rendered invalid stays so
            const marked = controls.filter((control) => !control.classList.contains(invalidClass))
            for (const control of marked) {
                control.classList.add(invalidClass)
            }

            return () => {
                for (const feedback of feedbacks) {
                    feedback.remove()
                }

                for (const control of marked) {
                    control.classList.remove(invalidClass)
                }
            }
        },
        // `alert`s first in the form
        showFormErrors: ({ messages, container }): Cleanup => {
            if (!container) {
                throw new Error('No element to show the errors of the form in: pass a container.')
            }

            const alerts = messages.map((message) => createMessage(message, alertClass))
            container.prepend(...alerts)

            return () => {
                for (const alert of alerts) {
                    alert.remove()
                }
            }
        },
    }
}

/** After the control, or after what Bootstrap wraps it in: its `.input-group`, the `.form-check` of a checkbox. */
function placeAfter(control: FormControl, feedbacks: HTMLElement[]): void {
    const wrapper = control.closest('.input-group') ?? (isChoice(control) ? control.closest('.form-check') : null)
    const target = wrapper ?? control
    target.after(...feedbacks)
}

function createMessage(message: string, className: string): HTMLElement {
    const element = document.createElement('div')
    element.className = className
    // The server's text, never markup
    element.textContent = message

    return element
}
