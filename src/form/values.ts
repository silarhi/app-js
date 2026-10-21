/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

export type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

export type FieldValue = string | boolean | string[] | null | undefined

/**
 * An option's value, preferring `data-value` (raw ids behind formatted labels).
 */
const optionValue = (option: HTMLOptionElement): string => option.dataset.value ?? option.value

/**
 * The radios answering to the same name as `radio`, itself included. As in the
 * browser, a group lives in its form; radios outside any form are grouped
 * within `scope` (the document by default).
 */
export function radioGroup(radio: HTMLInputElement, scope: ParentNode = document): HTMLInputElement[] {
    if (!radio.name) {
        return [radio]
    }

    return [...(radio.form ?? scope).querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(
        (other) => other.name === radio.name && other.form === radio.form
    )
}

/**
 * Read any control as a plain value: a checkbox is a boolean, a radio is its
 * group's checked value, a multiple select is an array.
 */
export function getElementValue(element: FormControl): FieldValue {
    if (element instanceof HTMLInputElement && element.type === 'radio') {
        return radioGroup(element).find((radio) => radio.checked)?.value
    }

    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
        return element.checked
    }

    if (element instanceof HTMLSelectElement) {
        if (element.multiple) {
            return [...element.selectedOptions].map(optionValue)
        }

        const selected = element.options[element.selectedIndex]

        return selected ? optionValue(selected) : null
    }

    return element.value
}

/**
 * A value as the strings options are matched against: `null` is none, a
 * single value is one.
 */
export function toValues(value: FieldValue | number): string[] {
    if (value === null || value === undefined) {
        return []
    }

    return (Array.isArray(value) ? value : [value]).map(String)
}

/**
 * Write a value read by {@link getElementValue}, natively. A widget that took
 * the control over (tom-select, select2) is driven through its behavior
 * instead: see `bindField()`.
 */
export function setElementValue(element: FormControl, value: FieldValue | number): void {
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
        element.checked = Boolean(value)
        return
    }

    if (element instanceof HTMLSelectElement) {
        // `null` selects nothing; `''` still selects a placeholder option
        const wanted = toValues(value)
        for (const option of element.options) {
            option.selected = wanted.includes(option.value) || wanted.includes(optionValue(option))
        }
        return
    }

    element.value = value === null || value === undefined ? '' : String(value)
}

export const isControl = (element: Element | null | undefined): element is FormControl =>
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement

export const isChoice = (control: Element | null | undefined): control is HTMLInputElement =>
    control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')
