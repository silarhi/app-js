/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/**
 * Visibility through a utility class rather than the `hidden` attribute, which
 * any `display` rule overrides. Pass `'d-none'` for plain Bootstrap.
 */
export const HIDDEN_CLASS = 'hidden'

export function show(element: Element, className: string = HIDDEN_CLASS): void {
    element.classList.remove(className)
}

export function hide(element: Element, className: string = HIDDEN_CLASS): void {
    element.classList.add(className)
}

export function toggle(element: Element, visible: boolean, className: string = HIDDEN_CLASS): void {
    element.classList.toggle(className, !visible)
}
