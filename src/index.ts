/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { LazyListener, Listener, Module, Page } from './types'

export type { AppOptions } from './App'
export { App } from './App'
export type {
    ContainerOptions,
    ParameterMap,
    Parameters,
    ServiceClass,
    ServiceFactories,
    ServiceFactory,
    ServiceId,
    ServiceMap,
    ServicesOf,
} from './Container'
export { Container, defineServices } from './Container'
export { HIDDEN_CLASS, hide, show, toggle } from './css'
export { appendHTML, byId, domReady, escapeHtml, findAll, findAllSelf, findOne, on, trigger } from './dom'
export { lazyListener } from './lazyListener'
export type {
    Cleanup,
    ConnectContext,
    ErrorContext,
    ErrorHandler,
    LazyListener,
    Listener,
    ListenerLoader,
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

export const defineLazyListener = <E extends Element = Element>(listener: LazyListener<E>): LazyListener<E> => listener

export const defineModule = (module: Module): Module => module

export const definePage = <P extends object = Record<string, unknown>>(page: Page<P>): Page<P> => page
