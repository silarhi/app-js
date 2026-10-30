/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { on } from '../dom'
import type { ConnectContext, Listener } from '../types'

export interface CopyToClipboardOptions {
    /** Default `[data-copy], [data-copy-target]`. */
    selector?: string
    /** Once the text is copied: say so (a toast from an app service…). */
    onSuccess?: (button: HTMLElement, text: string, context: ConnectContext) => void
    /** When the browser refused (no clipboard access, not a secure context). Default: logged. */
    onError?: (button: HTMLElement, error: unknown, context: ConnectContext) => void
}

/**
 * Copy a text to the clipboard on click: the button's `data-copy` value, or
 * the value (a field) or text (anything else) of the element its
 * `data-copy-target` selector finds.
 *
 *     copyToClipboard({ onSuccess: (button, text, { app }) => app.get('toasts').success('Copied') })
 */
export function copyToClipboard({
    selector = '[data-copy], [data-copy-target]',
    onSuccess,
    onError = (_button, error) => console.error('Failed to copy to the clipboard', error),
}: CopyToClipboardOptions = {}): Listener<HTMLElement> {
    return {
        selector,
        connect: (button, context) =>
            on(button, 'click', (event) => {
                event.preventDefault()
                const text = textOf(button)
                // Inside then(): a missing clipboard (not a secure context) throws instead of rejecting
                Promise.resolve()
                    .then(() => navigator.clipboard.writeText(text))
                    .then(
                        () => onSuccess?.(button, text, context),
                        (error: unknown) => onError(button, error, context)
                    )
            }),
    }
}

function textOf(button: HTMLElement): string {
    if (button.dataset.copy !== undefined) {
        return button.dataset.copy
    }

    const target = button.dataset.copyTarget ? document.querySelector(button.dataset.copyTarget) : null
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return target.value
    }

    return target?.textContent?.trim() ?? ''
}
