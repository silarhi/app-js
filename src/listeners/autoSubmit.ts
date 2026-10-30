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

export interface AutoSubmitOptions {
    /** Default `[data-autosubmit]`. */
    selector?: string
    /** The event that submits, default `change`: a widget's own one (`complete.bs.otpInput`) works too. */
    event?: string
}

/**
 * Submit the form of a field once it changes: a filter, a sort select, an OTP
 * input once complete. A field rendered outside its form joins it with the
 * `form` attribute, which `field.form` follows; on a form, any change in it
 * submits it.
 *
 * `requestSubmit()` fires `submit`, so validation, Turbo and `submitOnce()`
 * take it as a click on the submit button.
 */
export function autoSubmit({
    selector = '[data-autosubmit]',
    event = 'change',
}: AutoSubmitOptions = {}): Listener<HTMLElement> {
    return {
        selector,
        connect: (element) => on(element, event, () => formOf(element)?.requestSubmit()),
    }
}

function formOf(element: HTMLElement): HTMLFormElement | null {
    const form = 'form' in element ? element.form : null

    return form instanceof HTMLFormElement ? form : element.closest('form')
}
