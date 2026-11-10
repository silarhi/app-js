/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/**
 * Changes are read from the DOM when they are asked for: a field differs from
 * the value the server (or the prototype) rendered, kept by the browser as
 * `defaultValue` / `defaultChecked` / `defaultSelected`. Nothing to keep in
 * sync: an element leaving the page leaves the answer with it. A widget
 * rewriting a field when it starts declares the new starting value with
 * `field.defaultValue = field.value`.
 */

const getValues = (options: Iterable<HTMLOptionElement>): Set<string> =>
    new Set(Array.from(options, (option) => option.value))

/**
 * Whether a control differs from its rendered value.
 */
export function hasFieldChanged(field: Element): boolean {
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
        return field.checked !== field.defaultChecked
    }

    if (field instanceof HTMLInputElement && field.type === 'file') {
        // Its `value` stays empty until a file is chosen, whatever the server rendered in the attribute
        return (field.files?.length ?? 0) > 0
    }

    if (field instanceof HTMLSelectElement) {
        const defaults = getValues([...field.options].filter((option) => option.defaultSelected))

        // Without a default option the browser selects the first one
        if (!field.multiple && defaults.size === 0) {
            return field.selectedIndex > 0
        }

        // By value: a preferred choice is rendered twice, and Tom Select may select the other copy
        const selected = getValues(field.selectedOptions)

        return selected.size !== defaults.size || [...selected].some((value) => !defaults.has(value))
    }

    return (
        (field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            field instanceof HTMLOutputElement) &&
        field.value !== field.defaultValue
    )
}

/**
 * Whether a field of `element` changed: a form's own controls (`form`
 * attribute included), or the controls inside any other element (a collection
 * item). A form with a non-empty `data-track-changes` changed in a way its
 * fields cannot show: `refused` (the server rendered it back after its
 * submission, so what it shows is unsaved) or `changed` (see
 * {@link markFormChanged}).
 */
export function hasChanged(element: Element): boolean {
    if (element instanceof HTMLFormElement) {
        return Boolean(element.dataset.trackChanges) || [...element.elements].some(hasFieldChanged)
    }

    return [...element.querySelectorAll('input, select, textarea, output')].some(hasFieldChanged)
}

/**
 * Whether a form tracked with `data-track-changes` in `scope` has changes the
 * user would lose by leaving the page.
 */
export function hasUnsavedChanges(scope: ParentNode = document): boolean {
    return [...scope.querySelectorAll<HTMLFormElement>('form[data-track-changes]')].some(hasChanged)
}

/**
 * The tracked form of `element` changed in a way its fields cannot show (a
 * collection item removed).
 */
export function markFormChanged(element: Element): void {
    const form = element.closest<HTMLFormElement>('form[data-track-changes]')
    if (form) {
        form.dataset.trackChanges = 'changed'
    }
}
