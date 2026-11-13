/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { on as listen } from '../dom'
import type { FieldBehavior, FieldOption } from './behavior'
import { bootstrapTheme } from './bootstrap'
import { type FieldValue, type FormControl, getElementValue, isChoice, setElementValue, toValues } from './values'

/**
 * The bottom level, implementing every part: the browser's own controls (a
 * checkbox is a boolean, a radio group its checked value, an expanded choice
 * the values it has checked) and Symfony's Bootstrap markup.
 */
export const nativeBehavior: Required<FieldBehavior> = {
    ...bootstrapTheme(),

    getValue({ field }): FieldValue {
        const inputs = field.inputs
        if (field.expanded) {
            const checked = inputs.filter((input) => (input as HTMLInputElement).checked).map((input) => input.value)
            return inputs[0].type === 'checkbox' ? checked : (checked[0] ?? '')
        }

        return inputs[0] ? getElementValue(inputs[0]) : undefined
    },

    setValue({ field, value, silent }): void {
        const inputs = field.inputs
        const before = inputs.map(state)

        if (field.expanded || (value === null && isChoice(inputs[0]))) {
            const wanted = toValues(value)
            for (const input of inputs as HTMLInputElement[]) {
                input.checked = wanted.includes(input.value)
            }
        } else if (value === null) {
            for (const input of inputs) {
                setElementValue(input, input instanceof HTMLSelectElement && input.multiple ? null : '')
            }
        } else if (inputs[0]) {
            setElementValue(inputs[0], value)
        }

        if (!silent) {
            notify(inputs, before)
        }
    },

    isRequired({ field }): boolean {
        const inputs = field.inputs
        if (field.expanded && inputs[0].type === 'checkbox') {
            return field.element?.getAttribute('aria-required') === 'true'
        }

        return inputs.some((input) => input.required)
    },

    setRequired({ field, required }): void {
        const inputs = field.inputs
        // `required` on every checkbox of a group would demand them all: the
        // group is marked instead, as Symfony renders it
        if (field.expanded && inputs[0].type === 'checkbox') {
            if (required) {
                field.element?.setAttribute('aria-required', 'true')
            } else {
                field.element?.removeAttribute('aria-required')
            }
            return
        }

        for (const input of inputs) {
            input.required = required
        }
    },

    /** Every input disabled: nothing left to edit or submit. */
    isDisabled({ field }): boolean {
        const inputs = field.inputs

        return inputs.length > 0 && inputs.every((input) => input.disabled)
    },

    setDisabled({ field, disabled }): void {
        for (const input of field.inputs) {
            input.disabled = disabled
        }
    },

    setOptions({ field, options, silent }): void {
        const select = selectOf(field, 'setOptions')
        const before = state(select)
        const selected = new Set([...select.selectedOptions].map((option) => option.value))

        for (const option of [...select.options]) {
            if (option.value !== '') {
                option.remove()
            }
        }
        for (const choice of options) {
            const option = createOption(choice)
            option.selected = selected.has(choice.value)
            select.add(option)
        }

        if (!silent) {
            notify([select], [before])
        }
    },

    addOption({ field, option }): void {
        const select = selectOf(field, 'addOption')
        if (![...select.options].some(({ value }) => value === option.value)) {
            const selectedIndex = select.selectedIndex
            select.add(createOption(option))
            // A single select with no option picks the first one added: keep it empty
            if (selectedIndex === -1 && !select.multiple) {
                select.selectedIndex = -1
            }
        }
    },

    setPlaceholder({ field, placeholder }): void {
        const input = field.inputs[0]
        if (input instanceof HTMLSelectElement) {
            const empty = [...input.options].find(({ value }) => value === '')
            if (empty) {
                empty.text = placeholder
            }
        } else if (input && !isChoice(input)) {
            input.placeholder = placeholder
        }
    },

    on({ field, type, handler }) {
        const removals = field.inputs.map((input) => listen(input, type, handler))

        return () => {
            for (const remove of removals) {
                remove()
            }
        }
    },
}

/**
 * The field's select, which the options parts need.
 */
function selectOf(field: { inputs: FormControl[]; expanded: boolean }, part: string): HTMLSelectElement {
    const [input] = field.inputs
    if (field.expanded || !(input instanceof HTMLSelectElement)) {
        throw new Error(`The "${part}" part needs a <select>.`)
    }

    return input
}

function createOption({ value, text, data = {} }: FieldOption): HTMLOptionElement {
    const option = new Option(text, value)
    Object.assign(option.dataset, data)

    return option
}

/**
 * What a `change` would report: checked, the selected options, or the text.
 */
function state(input: FormControl): string | boolean {
    if (isChoice(input)) {
        return input.checked
    }
    if (input instanceof HTMLSelectElement) {
        return [...input.selectedOptions].map((option) => option.value).join('\u0000')
    }

    return input.value
}

/**
 * Fire `input` then `change`, bubbling, on every input the write changed, as a
 * user edit would: a radio group reports only the option that got checked.
 */
function notify(inputs: FormControl[], before: Array<string | boolean>): void {
    inputs.forEach((input, index) => {
        const changed = state(input) !== before[index]
        const uncheckedRadio = input instanceof HTMLInputElement && input.type === 'radio' && !input.checked
        if (changed && !uncheckedRadio) {
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
        }
    })
}
