/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App, defineListener, defineModule, definePage, type Listener, type Page } from '../src'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function spyListener(selector: string): Listener & { connected: Element[]; disconnected: Element[] } {
    const connected: Element[] = []
    const disconnected: Element[] = []

    return {
        selector,
        connected,
        disconnected,
        connect(element) {
            connected.push(element)
            return () => disconnected.push(element)
        },
    }
}

beforeEach(() => {
    document.body.innerHTML = ''
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('modules', () => {
    it('runs every module once, in order, on start()', () => {
        const calls: string[] = []
        const app = new App({ modules: [() => void calls.push('a'), () => void calls.push('b')] })

        app.start()
        app.start()

        expect(calls).toEqual(['a', 'b'])
    })

    it('runs a module added after start() immediately', () => {
        const module = vi.fn()
        const app = new App().start()

        app.addModule(module)

        expect(module).toHaveBeenCalledWith({ app })
    })

    it('keeps booting when a module throws', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const after = vi.fn()

        new App({
            modules: [
                () => {
                    throw new Error('boom')
                },
                after,
            ],
        }).start()

        expect(after).toHaveBeenCalledOnce()
    })

    it('logs an async module that rejects', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const module = defineModule(async () => {
            throw new Error('boom')
        })

        new App({ modules: [module] }).start()
        await flush()

        expect(error).toHaveBeenCalledWith('Module failed to start', module, expect.any(Error))
    })
})

describe('listeners', () => {
    it('connects descendants and the container itself, once per element', () => {
        document.body.innerHTML = '<div class="x" id="outer"><span class="x" id="inner"></span></div>'
        const listener = spyListener('.x')
        const app = new App({ listeners: [listener] })
        const outer = document.getElementById('outer') as Element

        app.mount(outer)
        app.mount(document)

        expect(listener.connected.map((el) => el.id)).toEqual(['outer', 'inner'])
    })

    it('connects listeners in registration order', () => {
        document.body.innerHTML = '<p></p>'
        const order: string[] = []
        const app = new App({
            listeners: [
                { selector: 'p', connect: () => void order.push('first') },
                { selector: 'p', connect: () => void order.push('second') },
            ],
        })

        app.mount()

        expect(order).toEqual(['first', 'second'])
    })

    it('ignores a listener registered twice', () => {
        document.body.innerHTML = '<p></p>'
        const listener = spyListener('p')
        const app = new App({ listeners: [listener] }).addListener(listener)

        app.mount()

        expect(listener.connected).toHaveLength(1)
    })

    it('waits for the first mount() before connecting a listener', () => {
        document.body.innerHTML = '<p></p>'
        const listener = spyListener('p')

        new App().addListener(listener)

        expect(listener.connected).toHaveLength(0)
    })

    it('connects a listener added after mount() to the elements already in the document', () => {
        document.body.innerHTML = '<div id="frame"><p id="inside"></p></div><p id="outside"></p>'
        const listener = spyListener('p')
        const app = new App()
        app.mount(document.getElementById('frame') as Element)

        app.addListener(listener)
        app.mount()

        expect(listener.connected.map((el) => el.id)).toEqual(['inside', 'outside'])
    })

    it('accepts typed listeners', () => {
        document.body.innerHTML = '<input value="hello">'
        const values: string[] = []
        const input = defineListener<HTMLInputElement>({
            selector: 'input',
            connect: (element) => void values.push(element.value),
        })

        new App().addListener(input).mount()

        expect(values).toEqual(['hello'])
    })

    it('disconnects the unmounted subtree only, and sweeps detached elements', () => {
        document.body.innerHTML = '<div id="a"><p id="a1"></p></div><div id="b"><p id="b1"></p></div><p id="c"></p>'
        const listener = spyListener('p')
        const app = new App({ listeners: [listener] })
        app.mount()

        document.getElementById('c')?.remove()
        app.unmount(document.getElementById('a') as Element)

        expect(listener.disconnected.map((el) => el.id).sort()).toEqual(['a1', 'c'])

        app.mount()
        expect(listener.connected.map((el) => el.id)).toEqual(['a1', 'b1', 'c', 'a1'])
    })

    describe('persistent elements', () => {
        const PAGE =
            '<header data-turbo-permanent id="player"><p id="track"></p><turbo-frame id="queue"><p id="next"></p></turbo-frame></header>' +
            '<main><p id="content"></p></main>'

        const ids = (elements: Element[]): string[] => elements.map((el) => el.id).sort()

        it('keeps what they hold connected across a page unmount', () => {
            document.body.innerHTML = PAGE
            const listener = spyListener('p')
            const app = new App({ listeners: [listener], persistent: '[data-turbo-permanent]' })
            app.mount()

            app.unmount()
            app.mount()

            expect(ids(listener.disconnected)).toEqual(['content'])
            expect(ids(listener.connected)).toEqual(['content', 'content', 'next', 'track'])
        })

        it('tears them down once a render dropped them', () => {
            document.body.innerHTML = PAGE
            const listener = spyListener('p')
            const app = new App({ listeners: [listener], persistent: '[data-turbo-permanent]' })
            app.mount()

            document.getElementById('player')?.remove()
            app.unmount()

            expect(ids(listener.disconnected)).toEqual(['content', 'next', 'track'])
        })

        it('tears down what an unmount of the persistent element itself, or of a part of it, covers', () => {
            document.body.innerHTML = PAGE
            const listener = spyListener('p')
            const app = new App({ listeners: [listener], persistent: '[data-turbo-permanent]' })
            app.mount()

            app.unmount(document.getElementById('queue') as Element)
            expect(ids(listener.disconnected)).toEqual(['next'])

            app.unmount(document.getElementById('player') as Element)
            expect(ids(listener.disconnected)).toEqual(['next', 'track'])
        })

        it('keeps the persistent element itself, but not once it or an element in it is the container', () => {
            document.body.innerHTML = PAGE
            const listener = spyListener('header, p')
            const app = new App({ listeners: [listener], persistent: '[data-turbo-permanent]' })
            app.mount()

            app.unmount()
            expect(ids(listener.disconnected)).toEqual(['content'])

            app.unmount(document.getElementById('track') as Element)
            expect(ids(listener.disconnected)).toEqual(['content', 'track'])

            app.unmount(document.getElementById('player') as Element)
            expect(ids(listener.disconnected)).toEqual(['content', 'next', 'player', 'track'])
        })

        it('tears down the persistent elements nested in a persistent container', () => {
            document.body.innerHTML =
                '<header data-turbo-permanent id="player"><div data-turbo-permanent id="volume"><p id="level"></p></div></header>'
            const listener = spyListener('p')
            const app = new App({ listeners: [listener], persistent: '[data-turbo-permanent]' })
            app.mount()

            app.unmount()
            expect(listener.disconnected).toEqual([])

            app.unmount(document.getElementById('player') as Element)
            expect(ids(listener.disconnected)).toEqual(['level'])
        })

        it('keeps nothing without the option', () => {
            document.body.innerHTML = PAGE
            const listener = spyListener('p')
            const app = new App({ listeners: [listener] })
            app.mount()
            app.unmount()

            expect(ids(listener.disconnected)).toEqual(['content', 'next', 'track'])
        })
    })

    it('keeps mounting when a listener throws', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.innerHTML = '<p></p>'
        const after = spyListener('p')
        const app = new App({
            listeners: [
                {
                    selector: 'p',
                    connect() {
                        throw new Error('boom')
                    },
                },
                after,
            ],
        })

        app.mount()

        expect(after.connected).toHaveLength(1)
        expect(console.error).toHaveBeenCalledOnce()
    })

    it('reconnects after unmount an element whose listener returned no cleanup', () => {
        document.body.innerHTML = '<p></p>'
        const connect = vi.fn()
        const app = new App({ listeners: [{ selector: 'p', connect }] })

        app.mount()
        app.unmount()
        app.mount()

        expect(connect).toHaveBeenCalledTimes(2)
    })

    it('keeps unmounting when a cleanup throws', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.innerHTML = '<p></p><p></p>'
        const after = spyListener('p')
        const app = new App({
            listeners: [
                {
                    selector: 'p',
                    connect: () => () => {
                        throw new Error('boom')
                    },
                },
                after,
            ],
        })

        app.mount()
        app.unmount()

        expect(after.disconnected).toHaveLength(2)
        expect(error).toHaveBeenCalledTimes(2)
        expect(error).toHaveBeenCalledWith('Failed to disconnect "p" listener', expect.any(Element), expect.any(Error))
    })

    it('stores the cleanup of an async connect and runs it on unmount', async () => {
        document.body.innerHTML = '<p></p>'
        const cleanup = vi.fn()
        const app = new App({ listeners: [{ selector: 'p', connect: async () => cleanup }] })

        app.mount()
        await flush()
        app.unmount()

        expect(cleanup).toHaveBeenCalledOnce()
    })

    it('runs an async cleanup that resolves after unmount right away', async () => {
        document.body.innerHTML = '<p></p>'
        const cleanup = vi.fn()
        let resolveConnect: (value: () => void) => void = () => {}
        const app = new App({
            listeners: [{ selector: 'p', connect: () => new Promise((resolve) => (resolveConnect = resolve)) }],
        })

        app.mount()
        app.unmount()
        expect(cleanup).not.toHaveBeenCalled()

        resolveConnect(cleanup)
        await flush()
        expect(cleanup).toHaveBeenCalledOnce()
    })

    it('keeps a late cleanup to its own connection after a disconnect → reconnect', async () => {
        document.body.innerHTML = '<p></p>'
        const first = vi.fn()
        const second = vi.fn()
        const resolvers: Array<(value: () => void) => void> = []
        const app = new App({
            listeners: [{ selector: 'p', connect: () => new Promise((resolve) => resolvers.push(resolve)) }],
        })

        app.mount()
        app.unmount()
        app.mount()
        resolvers[1]?.(second)
        resolvers[0]?.(first)
        await flush()

        expect(first).toHaveBeenCalledOnce()
        expect(second).not.toHaveBeenCalled()

        app.unmount()
        expect(second).toHaveBeenCalledOnce()
    })

    it('logs an async connect that rejects, and late cleanups that throw', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.innerHTML = '<p></p><i></i>'
        let resolveConnect: (value: () => void) => void = () => {}
        const app = new App({
            listeners: [
                { selector: 'p', connect: () => Promise.reject(new Error('boom')) },
                { selector: 'i', connect: () => new Promise((resolve) => (resolveConnect = resolve)) },
            ],
        })

        app.mount()
        app.unmount()
        resolveConnect(() => {
            throw new Error('late boom')
        })
        await flush()

        expect(error).toHaveBeenCalledWith('Failed to connect "p" listener', expect.any(Element), expect.any(Error))
        expect(error).toHaveBeenCalledWith('Failed to disconnect "i" listener', expect.any(Element), expect.any(Error))
    })
})

describe('pages', () => {
    it('imports a lazy chunk once for concurrent loads and passes params, app and container', async () => {
        const page = vi.fn<Page>()
        const loader = vi.fn(async () => ({ default: page }))
        const app = new App({ pages: { foo: loader } })
        const container = document.createElement('div')

        await Promise.all([app.loadPage('foo', { a: 1 }, container), app.loadPage('foo', { a: 2 }, container)])

        expect(loader).toHaveBeenCalledOnce()
        expect(page).toHaveBeenCalledTimes(2)
        expect(page).toHaveBeenCalledWith({ a: 1, app, container })
    })

    it('never lets params shadow app or container', async () => {
        const page = vi.fn<Page>()
        const app = new App().registerPage('foo', page)
        const container = document.createElement('div')

        await app.loadPage('foo', { app: 'nope', container: 'nope' }, container)

        expect(page).toHaveBeenCalledWith({ app, container })
    })

    it('retries a chunk whose import failed', async () => {
        const page = vi.fn<Page>()
        const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: page })
        const app = new App({ pages: { foo: loader } })

        await expect(app.loadPage('foo')).rejects.toThrow('offline')
        await app.loadPage('foo')

        expect(loader).toHaveBeenCalledTimes(2)
        expect(page).toHaveBeenCalledOnce()
    })

    it('queues an unknown page until registerPage()', async () => {
        const page = vi.fn<Page>()
        const app = new App()

        const loading = app.loadPage('late', { x: 1 })
        await flush()
        expect(page).not.toHaveBeenCalled()

        app.registerPage('late', page)
        await loading

        expect(page).toHaveBeenCalledWith(expect.objectContaining({ x: 1 }))
    })

    it('runs a waiting page once the script that registered it has run', async () => {
        const app = new App()
        const loading = app.loadPage('late')
        await flush()

        // A page entry registers itself while its module evaluates: the initializer reads a binding declared after
        // the registerPage() call, which a synchronous replay would hit in its temporal dead zone
        const seen: boolean[] = []
        let evaluated = false
        app.registerPage('late', () => void seen.push(evaluated))
        evaluated = true
        await loading

        expect(seen).toEqual([true])
    })

    it('connects data-page markers after every other listener', () => {
        document.body.innerHTML = '<div data-page=\'["foo"]\' data-page-params=\'{"id": 42}\' class="widget"></div>'
        const order: string[] = []
        const app = new App()
            .registerPage('foo', ({ id }) => void order.push(`page:${id}`))
            .addListener({ selector: '.widget', connect: () => void order.push('widget') })

        app.mount()

        expect(order).toEqual(['widget', 'page:42'])
    })

    it('accepts a bare page id', () => {
        document.body.innerHTML = '<div data-page="foo"></div>'
        const page = vi.fn<Page>()

        new App().registerPage('foo', page).mount()

        expect(page).toHaveBeenCalledOnce()
    })

    it('runs page cleanups on unmount, including ones that resolve after it', async () => {
        document.body.innerHTML = '<div data-page=\'["sync", "lazy"]\'></div>'
        const syncCleanup = vi.fn()
        const lazyCleanup = vi.fn()
        let resolveChunk: (value: { default: Page }) => void = () => {}
        const app = new App({
            pages: { lazy: () => new Promise((resolve) => (resolveChunk = resolve)) },
        }).registerPage('sync', () => syncCleanup)

        app.mount()
        await flush()
        app.unmount()
        expect(syncCleanup).toHaveBeenCalledOnce()

        resolveChunk({ default: () => lazyCleanup })
        await flush()
        expect(lazyCleanup).toHaveBeenCalledOnce()
    })

    it('warns and keeps the first initializer registered under an id', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const first = vi.fn<Page>()
        const app = new App().registerPage('foo', first).registerPage('foo', vi.fn())

        await app.loadPage('foo')

        expect(warn).toHaveBeenCalledWith('Page initializer "foo" is already registered.')
        expect(first).toHaveBeenCalledOnce()
    })

    it('rejects a chunk without a default-exported initializer', async () => {
        const app = new App({ pages: { broken: () => Promise.resolve({ default: 'nope' as unknown as Page }) } })

        await expect(app.loadPage('broken')).rejects.toThrow('Page chunk "broken" has no default-exported initializer.')
    })

    it('logs a page that fails to load', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.innerHTML = '<div data-page="broken"></div>'
        const app = new App({ pages: { broken: () => Promise.reject(new Error('chunk failed')) } })

        app.mount()
        await flush()

        expect(error).toHaveBeenCalledWith(
            'Failed to load page "broken"',
            document.body.firstElementChild,
            expect.any(Error)
        )
    })

    it('ignores an empty data-page', () => {
        document.body.innerHTML = '<div data-page=" "></div>'
        const loadPage = vi.spyOn(App.prototype, 'loadPage')

        new App().mount()

        expect(loadPage).not.toHaveBeenCalled()
    })

    it('refuses a data-page that is not an array of ids', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.innerHTML = '<div data-page=\'[1, "foo"]\'></div>'

        new App().mount()

        expect(error).toHaveBeenCalledWith(
            'Failed to connect "[data-page]" listener',
            document.body.firstElementChild,
            new TypeError('data-page must be a JSON array of strings, got [1, "foo"]')
        )
    })

    it('ignores a page returning no cleanup', async () => {
        document.body.innerHTML = '<div data-page="noop"></div>'
        const page = definePage(() => {})
        const app = new App().registerPage('noop', page)

        app.mount()
        await flush()

        expect(() => app.unmount()).not.toThrow()
    })
})

describe('async ordering', () => {
    it('reports no pending connect synchronously, then waits for every one within the root', async () => {
        document.body.innerHTML = '<p></p><i></i>'
        let resolveP: (value: undefined) => void = () => {}
        const app = new App({
            listeners: [
                { selector: 'p', connect: () => new Promise((resolve) => (resolveP = resolve)) },
                { selector: 'i', connect: () => Promise.reject(new Error('boom')) },
            ],
            onError: () => {},
        })

        expect(app.whenConnected()).toBeUndefined()

        app.mount()
        const settled = vi.fn()
        app.whenConnected()?.then(settled)
        await flush()
        expect(settled).not.toHaveBeenCalled()

        resolveP(undefined)
        await flush()
        expect(settled).toHaveBeenCalledOnce()
        expect(app.whenConnected()).toBeUndefined()
    })

    it('runs a page after the async connects within its element only', async () => {
        document.body.innerHTML = '<aside></aside><main data-page="foo"><input></main>'
        const calls: string[] = []
        const resolvers: Array<() => void> = []
        const deferred = (name: string) => () =>
            new Promise<undefined>((resolve) =>
                resolvers.push(() => {
                    calls.push(name)
                    resolve(undefined)
                })
            )
        const app = new App({
            listeners: [
                { selector: 'aside', connect: deferred('aside') },
                { selector: 'input', connect: deferred('input') },
            ],
        }).registerPage('foo', () => void calls.push('page'))

        app.mount()
        expect(calls).toEqual([])

        resolvers[1]?.()
        await flush()
        expect(calls).toEqual(['input', 'page'])

        resolvers[0]?.()
        await flush()
        expect(calls).toEqual(['input', 'page', 'aside'])
    })

    it('skips a page whose element was unmounted while its listeners connected', async () => {
        document.body.innerHTML = '<main data-page="foo"><input></main>'
        let resolveInput: (value: undefined) => void = () => {}
        const page = vi.fn<Page>()
        const app = new App({
            listeners: [{ selector: 'input', connect: () => new Promise((resolve) => (resolveInput = resolve)) }],
        }).registerPage('foo', page)

        app.mount()
        app.unmount()
        resolveInput(undefined)
        await flush()

        expect(page).not.toHaveBeenCalled()
    })
})

describe('onError', () => {
    it('receives every caught error with its context instead of the console', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.innerHTML = '<p></p><i></i><b data-page="missing-chunk"></b>'
        const onError = vi.fn()
        const module = () => {
            throw new Error('module')
        }
        const syncListener = {
            selector: 'p',
            connect: () => () => {
                throw new Error('disconnect')
            },
        }
        const asyncListener = { selector: 'i', connect: () => Promise.reject(new Error('async connect')) }
        const app = new App({
            modules: [module],
            listeners: [syncListener, asyncListener],
            pages: { 'missing-chunk': () => Promise.reject(new Error('chunk')) },
            onError,
        })

        app.start()
        app.mount()
        await flush()
        app.unmount()

        const p = document.querySelector('p')
        const i = document.querySelector('i')
        const b = document.querySelector('b')
        expect(onError.mock.calls).toEqual([
            [new Error('module'), { type: 'module', module }],
            [new Error('async connect'), { type: 'connect', listener: asyncListener, element: i }],
            [new Error('chunk'), { type: 'page', pageId: 'missing-chunk', element: b }],
            [new Error('disconnect'), { type: 'disconnect', listener: syncListener, element: p }],
        ])
        expect(consoleError).not.toHaveBeenCalled()
    })

    it('falls back to the console when the handler throws', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const handlerError = new Error('handler')
        const app = new App({
            modules: [
                () => {
                    throw new Error('module')
                },
            ],
            onError: () => {
                throw handlerError
            },
        })

        app.start()

        expect(consoleError).toHaveBeenCalledWith('The onError handler failed', handlerError, new Error('module'))
    })
})
