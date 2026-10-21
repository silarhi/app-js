/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App, defineListener, type Listener, type Page } from '../src'

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
})
