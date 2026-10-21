/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { App } from './App'
import { suggest } from './suggest'

/**
 * String service ids → the type `get()` resolves. Apps describe their own
 * services through declaration merging, the way Symfony apps get typed ids
 * from the compiled container. `app` is registered by `App` itself.
 *
 *     declare module '@silarhi/app-js' {
 *         interface ServiceMap {
 *             modalManager: ModalManager
 *             translator: Promise<Translator>
 *         }
 *     }
 */
export interface ServiceMap {
    app: App
}

/**
 * Parameter names → their type, augmented like {@link ServiceMap}.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by consumers
export interface ParameterMap {}

/**
 * A class used as its own service id (Symfony's FQCN ids): `get(ModalManager)`
 * is typed without touching {@link ServiceMap}.
 */
export type ServiceClass<T = unknown> = abstract new (...args: never[]) => T

export type ServiceId = string | ServiceClass

/**
 * Builds a service on its first `get()`. It may return a promise: lazy chunks
 * (`async () => new (await import('./Translator')).default()`) are shared by
 * every caller, and a rejected one is retried on the next `get()`.
 */
export type ServiceFactory<T = unknown> = (container: Container) => T

export type ServiceFactories = { [K in keyof ServiceMap]?: ServiceFactory<ServiceMap[K]> } & Record<
    string,
    ServiceFactory
>

/**
 * The service types a factory map builds, to derive {@link ServiceMap} from
 * the registrations instead of keeping a second list in sync:
 *
 *     export const services = defineServices({
 *         translator: async () => new Translator(),
 *         // A factory reading the container needs its return type: inference
 *         // would loop through ServiceMap
 *         modalManager: async (c): Promise<ModalManager> => new ModalManager(await c.get('translator')),
 *     })
 *
 *     declare module '@silarhi/app-js' {
 *         interface ServiceMap extends ServicesOf<typeof services> {}
 *     }
 */
export type ServicesOf<F extends Record<string, ServiceFactory>> = { [K in keyof F]: ReturnType<F[K]> }

/**
 * Identity helper typing `container` in every factory, for {@link ServicesOf}.
 */
export const defineServices = <F extends Record<string, ServiceFactory>>(factories: F): F => factories

export type Parameters = Partial<ParameterMap> & Record<string, unknown>

export interface ContainerOptions {
    services?: ServiceFactories
    parameters?: Parameters
}

/**
 * Lazy service container with Symfony's split between services (built once,
 * on demand, by a factory) and parameters (plain values).
 *
 * It ships no service of its own: an app registers its services, and shared
 * listeners take their collaborators as options rather than reading ids they
 * cannot know.
 */
export class Container {
    readonly #factories = new Map<ServiceId, ServiceFactory>()
    readonly #instances = new Map<ServiceId, unknown>()
    readonly #resolving = new Set<ServiceId>()
    readonly #parameters = new Map<string, unknown>()

    constructor({ services = {}, parameters = {} }: ContainerOptions = {}) {
        for (const [id, factory] of Object.entries(services)) {
            this.set(id, factory)
        }
        for (const [name, value] of Object.entries(parameters)) {
            this.setParameter(name, value)
        }
    }

    /**
     * Register a service factory. Replacing a service that was already built
     * throws, like Symfony does: callers holding the old instance would never
     * see the new one.
     */
    set<K extends keyof ServiceMap & string>(id: K, factory: ServiceFactory<ServiceMap[K]>): this
    set<T>(id: ServiceClass<T>, factory: ServiceFactory<T>): this
    set(id: string, factory: ServiceFactory): this
    set(id: ServiceId, factory: ServiceFactory): this {
        if (this.#instances.has(id)) {
            throw new Error(`The "${label(id)}" service is already initialized, you cannot replace it.`)
        }

        this.#factories.set(id, factory)

        return this
    }

    get<K extends keyof ServiceMap & string>(id: K): ServiceMap[K]
    get<T>(id: ServiceClass<T>): T
    get<T = unknown>(id: string): T
    get(id: ServiceId): unknown {
        if (this.#instances.has(id)) {
            return this.#instances.get(id)
        }

        const factory = this.#factories.get(id)
        if (!factory) {
            throw new ReferenceError(
                `You have requested a non-existent service "${label(id)}".${suggest(label(id), [...this.#factories.keys()].map(label))}`
            )
        }

        if (this.#resolving.has(id)) {
            const path = [...this.#resolving, id].map(label).join(' -> ')
            throw new Error(`Circular reference detected for service "${label(id)}", path: "${path}".`)
        }

        this.#resolving.add(id)
        try {
            const instance = factory(this)
            this.#instances.set(id, instance)
            if (instance instanceof Promise) {
                instance.catch(() => {
                    if (this.#instances.get(id) === instance) {
                        this.#instances.delete(id)
                    }
                })
            }

            return instance
        } finally {
            this.#resolving.delete(id)
        }
    }

    has(id: ServiceId): boolean {
        return this.#factories.has(id)
    }

    /**
     * Whether the service was already built: lets a cleanup skip services
     * nobody asked for.
     */
    initialized(id: ServiceId): boolean {
        return this.#instances.has(id)
    }

    setParameter<K extends keyof ParameterMap & string>(name: K, value: ParameterMap[K]): this
    setParameter(name: string, value: unknown): this
    setParameter(name: string, value: unknown): this {
        this.#parameters.set(name, value)

        return this
    }

    getParameter<K extends keyof ParameterMap & string>(name: K): ParameterMap[K]
    getParameter<T = unknown>(name: string): T
    getParameter(name: string): unknown {
        if (!this.#parameters.has(name)) {
            throw new ReferenceError(
                `You have requested a non-existent parameter "${name}".${suggest(name, [...this.#parameters.keys()])}`
            )
        }

        return this.#parameters.get(name)
    }

    hasParameter(name: string): boolean {
        return this.#parameters.has(name)
    }
}

function label(id: ServiceId): string {
    return typeof id === 'string' ? id : id.name || '(anonymous class)'
}
