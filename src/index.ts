/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { Listener, Module, Page } from './types'

export type { AppOptions } from './App'
export { App } from './App'
export { findAllSelf, on } from './dom'
export type {
    Cleanup,
    ConnectContext,
    Listener,
    MaybeCleanup,
    Module,
    ModuleContext,
    Page,
    PageContext,
    PageLoader,
    PageLoaders,
} from './types'

/**
 * Identity helpers: no runtime effect, they give JS and TS consumers typed
 * `element` / `context` arguments without writing the annotation.
 *
 *     export default defineListener<HTMLFormElement>({ selector: 'form[data-submit-once]', connect(form) { … } })
 */
export const defineListener = <E extends Element = Element>(listener: Listener<E>): Listener<E> => listener

export const defineModule = (module: Module): Module => module

export const definePage = <P extends object = Record<string, unknown>>(page: Page<P>): Page<P> => page
