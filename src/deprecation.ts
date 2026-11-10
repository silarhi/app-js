/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/** The former attributes already reported: one warning per page is enough. */
const reported = new Set<string>()

/**
 * The value of the `attribute` of `element`, else of its former name
 * `legacy`, read with a deprecation warning until the next major version.
 */
export function getDataAttribute(element: Element, attribute: string, legacy: string): string | undefined {
    const value = element.getAttribute(attribute) ?? element.getAttribute(legacy)
    if (value === null) {
        return undefined
    }

    if (!element.hasAttribute(attribute) && !reported.has(legacy)) {
        reported.add(legacy)
        console.warn(`The "${legacy}" attribute is deprecated, use "${attribute}" instead.`)
    }

    return value
}

/**
 * Forget the warnings already given, so a test sees each one again.
 *
 * @internal
 */
export function resetDeprecations(): void {
    reported.clear()
}
