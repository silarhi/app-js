/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { describe, expect, it, vi } from 'vitest'
import { App, Container, defineServices, type ServicesOf } from '../src'

class Mailer {}

describe('Container', () => {
    it('builds a service once, on its first get()', () => {
        const factory = vi.fn(() => ({ sent: 0 }))
        const container = new Container({ services: { mailer: factory } })

        expect(factory).not.toHaveBeenCalled()
        expect(container.get('mailer')).toBe(container.get('mailer'))
        expect(factory).toHaveBeenCalledTimes(1)
    })

    it('hands the container to factories to wire dependencies', () => {
        const container = new Container({
            services: {
                transport: () => 'smtp',
                mailer: (c) => ({ transport: c.get<string>('transport') }),
            },
        })

        expect(container.get('mailer')).toEqual({ transport: 'smtp' })
    })

    it('accepts a class as its own id', () => {
        const container = new Container().set(Mailer, () => new Mailer())

        const mailer: Mailer = container.get(Mailer)

        expect(mailer).toBeInstanceOf(Mailer)
        expect(container.has(Mailer)).toBe(true)
    })

    it('suggests the closest id for a mistyped one', () => {
        const container = new Container({ services: { modalManager: () => ({}) } })

        expect(() => container.get('modalManger')).toThrow(
            'You have requested a non-existent service "modalManger". Did you mean this: "modalManager"?'
        )
    })

    it('reports circular references with their path', () => {
        const container = new Container({ services: { a: (c) => c.get('b'), b: (c) => c.get('a') } })

        expect(() => container.get('a')).toThrow('Circular reference detected for service "a", path: "a -> b -> a".')
    })

    it('shares a pending async service and retries a rejected one', async () => {
        const factory = vi.fn().mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValue('translator')
        const container = new Container({ services: { translator: factory } })

        await expect(container.get('translator')).rejects.toThrow('chunk failed')
        expect(container.get('translator')).toBe(container.get('translator'))
        await expect(container.get('translator')).resolves.toBe('translator')
        expect(factory).toHaveBeenCalledTimes(2)
    })

    it('refuses to replace a service already built', () => {
        const container = new Container({ services: { mailer: () => 1 } })
        container.set('mailer', () => 2)
        container.get('mailer')

        expect(() => container.set('mailer', () => 3)).toThrow('already initialized')
    })

    it('does not keep a factory that threw, and frees it for a retry', () => {
        const factory = vi
            .fn()
            .mockImplementationOnce(() => {
                throw new Error('boom')
            })
            .mockReturnValue('ok')
        const container = new Container({ services: { flaky: factory } })

        expect(() => container.get('flaky')).toThrow('boom')
        expect(container.initialized('flaky')).toBe(false)
        expect(container.get('flaky')).toBe('ok')
    })

    it('tells registered and built services apart', () => {
        const container = new Container({ services: { mailer: () => ({}) } })

        expect(container.has('mailer')).toBe(true)
        expect(container.has('missing')).toBe(false)
        expect(container.initialized('mailer')).toBe(false)

        container.get('mailer')

        expect(container.initialized('mailer')).toBe(true)
    })

    it('lists every close id, or none when nothing is close', () => {
        const container = new Container({ services: { mailer: () => 1, mailerTransport: () => 2, logger: () => 3 } })

        expect(() => container.get('mail')).toThrow('Did you mean one of these: "mailer", "mailerTransport"?')
        expect(() => container.get('database')).toThrow(/^You have requested a non-existent service "database"\.$/)
    })

    it('names class ids in errors', () => {
        class Unregistered {}
        const Anonymous = (() => class {})()
        const container = new Container().set(Mailer, () => new Mailer())

        expect(() => container.get(Unregistered)).toThrow('non-existent service "Unregistered"')
        expect(() => container.get(Anonymous)).toThrow('non-existent service "(anonymous class)"')
    })

    it('replaces a service that was not built yet', () => {
        const container = new Container({ services: { mailer: () => 'first' } })

        container.set('mailer', () => 'second')

        expect(container.get('mailer')).toBe('second')
    })

    it('keeps parameters apart from services, functions included', () => {
        const callback = (): void => {}
        const container = new Container({ parameters: { locale: 'fr', callback } })

        expect(container.getParameter('locale')).toBe('fr')
        expect(container.getParameter('callback')).toBe(callback)
        expect(container.has('locale')).toBe(false)
        expect(() => container.getParameter('local')).toThrow('Did you mean this: "locale"?')
    })

    it('sets, overrides and checks parameters', () => {
        const container = new Container({ parameters: { locale: 'fr' } })

        container.setParameter('locale', 'en').setParameter('debug', false)

        expect(container.getParameter('locale')).toBe('en')
        expect(container.getParameter('debug')).toBe(false)
        expect(container.hasParameter('debug')).toBe(true)
        expect(container.hasParameter('missing')).toBe(false)
        expect(() => container.getParameter('missing')).toThrow(
            /^You have requested a non-existent parameter "missing"\.$/
        )
    })
})

describe('defineServices', () => {
    it('types the factories for ServicesOf', () => {
        const services = defineServices({
            transport: () => 'smtp',
            mailer: (c): { transport: string } => ({ transport: c.get<string>('transport') }),
        })
        const container = new Container({ services })

        const mailer: ServicesOf<typeof services>['mailer'] = container.get('mailer')

        expect(mailer.transport).toBe('smtp')
    })
})

describe('App container', () => {
    it('exposes services, parameters and itself', () => {
        const app = new App({ services: { mailer: (c) => ({ app: c.get('app') }) }, parameters: { locale: 'fr' } })

        expect(app.get('app')).toBe(app)
        expect(app.get<{ app: App }>('mailer').app).toBe(app)
        expect(app.getParameter('locale')).toBe('fr')
    })

    it('shares its container and resolves class ids', () => {
        const app = new App()
        app.container.set(Mailer, () => new Mailer())

        expect(app.get(Mailer)).toBeInstanceOf(Mailer)
        expect(app.container.get('app')).toBe(app)
    })

    it('keeps itself as the app service', () => {
        const app = new App({ services: { app: (() => 'not the app') as unknown as () => App } })

        expect(app.get('app')).toBe(app)
    })
})
