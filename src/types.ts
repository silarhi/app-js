/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { App } from './App'

/**
 * Teardown returned by a listener's `connect` or a page initializer. Runs when
 * `App.unmount()` disconnects the element.
 */
export type Cleanup = () => void

/**
 * What a listener or page may return. `void` (not just `undefined`) lets a
 * standalone `function connect(el) { … }` with no `return` type-check.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: see above, consumers must be allowed to return nothing
export type MaybeCleanup = Cleanup | void

export interface ConnectContext {
    app: App
}

/**
 * Per-element behaviour. `App.mount(container)` runs `connect` once per element
 * matching `selector` inside `container` (the container itself included).
 *
 * `connect` is declared with method syntax on purpose: it keeps
 * `Listener<HTMLInputElement>` assignable to `Listener`, so typed listeners can
 * be registered next to untyped ones.
 */
export interface Listener<E extends Element = Element> {
    selector: string
    connect(element: E, context: ConnectContext): MaybeCleanup
}

export interface ModuleContext {
    app: App
}

/**
 * Boot-once hook, run by `App.start()`. Binds to `document` / `window` /
 * library globals only — never to elements a partial render may replace. Its
 * return value is ignored: modules live as long as the page.
 */
export type Module = (context: ModuleContext) => void | Promise<void>

/**
 * Framework-provided part of a page context. `app` and `container` always win
 * over params of the same name.
 */
export interface PageContext {
    app: App
    container: Element
}

/**
 * Page initializer: receives `{ app, container, ...params }`, where `params`
 * come from the element's `data-page-params` JSON (or `App.loadPage()`).
 */
export type Page<P extends object = Record<string, unknown>> = (
    context: PageContext & P
) => MaybeCleanup | Promise<MaybeCleanup>

/**
 * Lazy page chunk, typically `() => import('./pages/foo')`. The module's
 * default export is the page initializer.
 */
// biome-ignore lint/suspicious/noExplicitAny: params are page-specific, the registry cannot know them
export type PageLoader = () => Promise<{ default: Page<any> }>

export type PageLoaders = Record<string, PageLoader>
