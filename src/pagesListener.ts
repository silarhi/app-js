/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { Cleanup, Listener } from './types'

/**
 * Parse `data-page`: a JSON array of page ids (`'["foo","bar"]'`, what a
 * server-side helper emits) or a single bare id (`"foo"`).
 */
function parsePageIds(value: string | undefined): string[] {
    const trimmed = value?.trim() ?? ''
    if (trimmed === '') {
        return []
    }

    if (!trimmed.startsWith('[')) {
        return [trimmed]
    }

    const ids: unknown = JSON.parse(trimmed)
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
        throw new TypeError(`data-page must be a JSON array of strings, got ${trimmed}`)
    }

    return ids
}

/**
 * Built-in listener behind `<div data-page='["foo"]' data-page-params='{…}'>`:
 * every id shares the same params. `App` always connects it after the
 * consumer's listeners, and it waits for their async connects within its
 * element, so page code can rely on them being connected. With none pending,
 * a registered initializer still runs within the mount pass.
 *
 * Pages load lazily — a cleanup may arrive after the element was disconnected:
 * it then runs immediately.
 */
export const pagesListener: Listener<HTMLElement> = {
    selector: '[data-page]',
    connect(element, { app }) {
        const ids = parsePageIds(element.dataset.page)
        const params: Record<string, unknown> = JSON.parse(element.dataset.pageParams || '{}')
        const cleanups: Cleanup[] = []
        let disconnected = false

        const load = (): void => {
            if (disconnected) {
                return
            }

            for (const id of ids) {
                app.loadPage(id, params, element).then(
                    (cleanup) => {
                        if (typeof cleanup !== 'function') {
                            return
                        }
                        if (disconnected) {
                            cleanup()
                        } else {
                            cleanups.push(cleanup)
                        }
                    },
                    (error: unknown) => app.reportError(error, { type: 'page', pageId: id, element })
                )
            }
        }

        const connecting = app.whenConnected(element)
        if (connecting) {
            void connecting.then(load)
        } else {
            load()
        }

        return () => {
            disconnected = true
            for (const cleanup of cleanups.splice(0)) {
                cleanup()
            }
        }
    },
}
