/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { Cleanup } from './types'

/**
 * Visibility through a utility class rather than the `hidden` attribute, which
 * any `display` rule overrides. The initial app-wide class, see
 * `setHiddenClass()`.
 */
export const HIDDEN_CLASS = 'hidden'

let hiddenClass = HIDDEN_CLASS

/**
 * Set the class `show` / `hide` / `toggle` and the form fields use when none
 * is passed, once at boot: `setHiddenClass('d-none')` for plain Bootstrap.
 * Returns the restoration of the previous one.
 */
export function setHiddenClass(className: string): Cleanup {
    const previous = hiddenClass
    hiddenClass = className

    return () => {
        hiddenClass = previous
    }
}

export function getHiddenClass(): string {
    return hiddenClass
}

export function show(element: Element, className: string = hiddenClass): void {
    element.classList.remove(className)
}

export function hide(element: Element, className: string = hiddenClass): void {
    element.classList.add(className)
}

export function toggle(element: Element, visible: boolean, className: string = hiddenClass): void {
    element.classList.toggle(className, !visible)
}
