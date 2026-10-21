/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { findAllSelf } from './dom'
import { pagesListener } from './pagesListener'
import type { Cleanup, Listener, MaybeCleanup, Module, Page, PageLoaders } from './types'

export interface AppOptions {
    /** Boot-once hooks, run in order by `start()`. */
    modules?: Module[]
    /** Per-element listeners, connected in registration order on every `mount()`. */
    listeners?: Listener[]
    /** Page id → lazy chunk, resolved by `loadPage()` / `data-page`. */
    pages?: PageLoaders
}

/**
 * Front-end orchestrator for server-rendered apps.
 *
 * It owns no DOM driver: call `mount(container)` / `unmount(container)` from
 * whatever renders HTML — `@silarhi/turbo`'s `TurboHandler`, a `fetch` that
 * swaps a fragment, or a single `mount(document)` on a classic page load.
 *
 * Bookkeeping is per element: `mount` skips elements already connected, so
 * overlapping mounts are safe; `unmount` disconnects the container, its
 * descendants, and any connected element that already left the document.
 */
export class App {
    readonly #modules: Module[] = []
    readonly #listeners: Listener[] = []
    readonly #loaders: PageLoaders = {}
    readonly #pages = new Map<string, Page>()
    readonly #pageImports = new Map<string, Promise<void>>()
    readonly #pageResolvers = new Map<string, Array<() => void>>()
    readonly #tracked = new Map<Listener, Set<Element>>([[pagesListener as Listener, new Set()]])
    readonly #cleanups = new WeakMap<Element, Map<Listener, Cleanup>>()
    #started = false
    #mounted = false

    constructor({ modules = [], listeners = [], pages = {} }: AppOptions = {}) {
        for (const module of modules) {
            this.addModule(module)
        }
        for (const listener of listeners) {
            this.addListener(listener)
        }
        this.addPages(pages)
    }

    /**
     * Register a boot-once module. Added after `start()`, it runs right away.
     */
    addModule(module: Module): this {
        this.#modules.push(module)
        if (this.#started) {
            this.#runModule(module)
        }

        return this
    }

    /**
     * Register a per-element listener. Registering the same object twice is a
     * no-op.
     *
     * Added after the first `mount()` (e.g. from a lazy page chunk), it
     * connects right away to the matching elements already in the document —
     * after the `data-page` initializers that already ran, so it is the one
     * exception to "pages connect last".
     */
    addListener<E extends Element>(listener: Listener<E>): this {
        const entry = listener as Listener
        if (this.#tracked.has(entry)) {
            return this
        }

        this.#listeners.push(entry)
        this.#tracked.set(entry, new Set())

        if (this.#mounted) {
            this.#connect(entry, document)
        }

        return this
    }

    /**
     * Register lazy page chunks. An id already known keeps its first loader.
     */
    addPages(loaders: PageLoaders): this {
        for (const [pageId, loader] of Object.entries(loaders)) {
            this.#loaders[pageId] ??= loader
        }

        return this
    }

    /**
     * Run every boot-once module. Idempotent.
     */
    start(): this {
        if (this.#started) {
            return this
        }

        this.#started = true
        for (const module of this.#modules) {
            this.#runModule(module)
        }

        return this
    }

    /**
     * Connect every listener to its matching elements within `container`
     * (the container itself included). The built-in `data-page` listener
     * always runs last, so page code can rely on every other listener.
     */
    mount(container: ParentNode = document): void {
        this.#mounted = true
        for (const listener of this.#allListeners()) {
            this.#connect(listener, container)
        }
    }

    /**
     * Disconnect every connected element `container` covers: the container,
     * its descendants, and — detached sweep — elements already removed from
     * the document.
     */
    unmount(container: ParentNode = document): void {
        for (const listener of this.#allListeners()) {
            const tracked = this.#tracked.get(listener)
            if (!tracked) {
                continue
            }

            for (const element of tracked) {
                if (element.isConnected && element !== container && !container.contains(element)) {
                    continue
                }

                tracked.delete(element)
                const cleanups = this.#cleanups.get(element)
                const cleanup = cleanups?.get(listener)
                if (!cleanup) {
                    continue
                }

                cleanups?.delete(listener)
                try {
                    cleanup()
                } catch (error) {
                    console.error(`Failed to disconnect "${listener.selector}" listener`, element, error)
                }
            }
        }
    }

    /**
     * Register a page initializer directly (no lazy chunk). Replays the
     * `loadPage()` calls that were waiting for it.
     */
    // biome-ignore lint/suspicious/noExplicitAny: params are page-specific, the registry cannot know them
    registerPage(pageId: string, page: Page<any>): this {
        if (this.#pages.has(pageId)) {
            console.warn(`Page initializer "${pageId}" is already registered.`)
            return this
        }

        this.#pages.set(pageId, page)

        const resolvers = this.#pageResolvers.get(pageId)
        this.#pageResolvers.delete(pageId)
        for (const resolve of resolvers ?? []) {
            resolve()
        }

        return this
    }

    /**
     * Invoke a page initializer with `{ ...params, app, container }`.
     *
     * Resolution: a registered initializer runs synchronously (within the
     * caller's mount pass); a known lazy id imports its chunk once — concurrent
     * calls share the import, a failed import is retried on the next call —
     * then runs; an unknown id waits for `registerPage()`.
     */
    async loadPage(
        pageId: string,
        params: object = {},
        container: Element = document.documentElement
    ): Promise<MaybeCleanup> {
        const page = this.#pages.get(pageId)
        if (page) {
            return page({ ...params, app: this, container })
        }

        const loader = this.#loaders[pageId]
        if (!loader) {
            return new Promise<MaybeCleanup>((resolve) => {
                const resolvers = this.#pageResolvers.get(pageId) ?? []
                resolvers.push(() => resolve(this.loadPage(pageId, params, container)))
                this.#pageResolvers.set(pageId, resolvers)
            })
        }

        let pending = this.#pageImports.get(pageId)
        if (!pending) {
            pending = loader().then((module) => {
                if (typeof module.default !== 'function') {
                    throw new TypeError(`Page chunk "${pageId}" has no default-exported initializer.`)
                }
                this.registerPage(pageId, module.default)
            })
            this.#pageImports.set(pageId, pending)
            pending.catch(() => this.#pageImports.delete(pageId))
        }

        await pending

        return this.loadPage(pageId, params, container)
    }

    #allListeners(): Listener[] {
        return [...this.#listeners, pagesListener as Listener]
    }

    #connect(listener: Listener, container: ParentNode): void {
        const tracked = this.#tracked.get(listener)
        if (!tracked) {
            return
        }

        for (const element of findAllSelf(listener.selector, container)) {
            if (tracked.has(element)) {
                continue
            }

            tracked.add(element)
            try {
                const cleanup = listener.connect(element, { app: this })
                if (typeof cleanup === 'function') {
                    let cleanups = this.#cleanups.get(element)
                    if (!cleanups) {
                        cleanups = new Map()
                        this.#cleanups.set(element, cleanups)
                    }
                    cleanups.set(listener, cleanup)
                }
            } catch (error) {
                console.error(`Failed to connect "${listener.selector}" listener`, element, error)
            }
        }
    }

    #runModule(module: Module): void {
        try {
            const result = module({ app: this })
            if (result instanceof Promise) {
                result.catch((error: unknown) => console.error('Module failed to start', module, error))
            }
        } catch (error) {
            console.error('Module failed to start', module, error)
        }
    }
}
