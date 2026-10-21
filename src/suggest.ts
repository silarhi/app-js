/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/**
 * The known names closest to a mistyped one, by edit distance or substring.
 */
export function closest(needle: string, candidates: string[]): string[] {
    const lower = needle.toLowerCase()

    return candidates.filter((candidate) => {
        const other = candidate.toLowerCase()
        return other.includes(lower) || lower.includes(other) || distance(lower, other) <= Math.max(1, lower.length / 3)
    })
}

/**
 * Symfony-style hint for a mistyped id or name, ready to append to a message.
 */
export function suggest(needle: string, candidates: string[]): string {
    return hint(closest(needle, candidates))
}

export function hint(close: string[]): string {
    if (close.length === 0) {
        return ''
    }

    return close.length === 1
        ? ` Did you mean this: "${close[0]}"?`
        : ` Did you mean one of these: "${close.join('", "')}"?`
}

function distance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i++) {
        const current = [i]
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            )
        }
        previous = current
    }

    return previous[b.length]
}
