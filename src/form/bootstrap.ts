/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { HIDDEN_CLASS, toggle } from '../css'
import type { FieldBehavior } from './behavior'

export interface BootstrapThemeOptions {
    /** Defaults to Symfony's `.form-group` row. */
    groupSelector?: string
    /** Defaults to `hidden`; `d-none` for plain Bootstrap. */
    hiddenClass?: string
    requiredClass?: string
}

/**
 * The markup parts for Symfony's Bootstrap form themes: rows in a group, a
 * single checkbox labelled by its sibling `.form-check-label`, other fields
 * by their group's `legend` / `label`. The native level uses the defaults;
 * configure them for the app with `setFieldDefaults(bootstrapTheme({ … }))`.
 */
export function bootstrapTheme({
    groupSelector = '.form-group',
    hiddenClass = HIDDEN_CLASS,
    requiredClass = 'required',
}: BootstrapThemeOptions = {}): Required<Pick<FieldBehavior, 'group' | 'label' | 'setVisible' | 'markRequired'>> {
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
    }
}
