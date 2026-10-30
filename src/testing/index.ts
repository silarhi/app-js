/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { App, type AppOptions } from '../App'
import type { Cleanup, LazyListener, MaybeCleanup } from '../types'

/**
 * Test helpers for an app's listeners, with no test runner of its own: call
 * `resetFixtures()` from the runner's `afterEach`.
 *
 * Two ways in. `connectListener()` calls one listener on one element, as
 * `app.mount()` would, and hands its cleanup to the test; `mountFixture()`
 * renders markup and connects through a real `App`, as a page load does.
 */

const fixtures = new Set<App>()

/**
 * Render `html` as the whole body, then start an app built from `options` and
 * mount it on the document. Await `app.whenConnected()` when a listener
 * connects asynchronously.
 *
 *     const app = mountFixture('<select data-autosubmit>…</select>', { listeners: [autosubmit] })
 */
export function mountFixture(html: string, options: AppOptions = {}): App {
    document.body.innerHTML = html
    const app = new App(options)
    fixtures.add(app)
    app.start()
    app.mount(document)

    return app
}

/**
 * Unmount every app `mountFixture()` started, so a listener bound to
 * `document` does not outlive its test, and empty the body.
 */
export function resetFixtures(): void {
    for (const app of fixtures) {
        app.unmount(document)
    }
    fixtures.clear()
    document.body.innerHTML = ''
}

/**
 * Connect `listener` to `element` as `app.mount()` would and return its
 * cleanup, for the test to call. It throws when the listener returns none, so
 * a listener that stops cleaning up fails its test. Without `app`, a bare one
 * is passed: give the services the listener reads.
 */
export function connectListener<E extends Element>(
    listener: LazyListener<E>,
    element: E,
    app: App = new App()
): Cleanup {
    const cleanup = connectNow(listener, element, app)
    if (typeof cleanup !== 'function') {
        throw new TypeError('The listener returned no cleanup: connect it with connectListenerWithoutCleanup()')
    }

    return cleanup
}

/**
 * Connect a listener that leaves nothing to undo on `element` (a one-off
 * change, or nothing to do). It throws when the listener returns a cleanup
 * after all, which the test should then get from `connectListener()`.
 */
export function connectListenerWithoutCleanup<E extends Element>(
    listener: LazyListener<E>,
    element: E,
    app: App = new App()
): void {
    if (typeof connectNow(listener, element, app) === 'function') {
        throw new TypeError('The listener returned a cleanup: connect it with connectListener() and call it')
    }
}

/**
 * The async counterpart of `connectListener()`, for a listener whose
 * `connect` returns a promise (a lazy chunk, an awaited import…).
 */
export async function connectListenerAsync<E extends Element>(
    listener: LazyListener<E>,
    element: E,
    app: App = new App()
): Promise<Cleanup> {
    const cleanup = await listener.connect(element, { app })
    if (typeof cleanup !== 'function') {
        throw new TypeError('The listener returned no cleanup')
    }

    return cleanup
}

function connectNow<E extends Element>(listener: LazyListener<E>, element: E, app: App): MaybeCleanup {
    const cleanup = listener.connect(element, { app })
    if (cleanup instanceof Promise) {
        // A rejection would otherwise go unhandled, failing the run instead of the test
        cleanup.catch(() => undefined)
        throw new TypeError('The listener connects asynchronously: await connectListenerAsync() instead')
    }

    return cleanup
}
