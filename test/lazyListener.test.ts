/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App, defineLazyListener, defineListener, type LazyListener, type Listener, lazyListener } from '../src'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
    document.body.innerHTML = ''
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('lazyListener', () => {
    it('imports nothing until an element matches', () => {
        document.body.innerHTML = '<p></p>'
        const loader = vi.fn(async () => ({ default: defineListener({ selector: 'input', connect() {} }) }))

        new App({ listeners: [lazyListener('input', loader)] }).mount()

        expect(loader).not.toHaveBeenCalled()
    })

    it('imports the chunk once and connects every element with app in context', async () => {
        document.body.innerHTML = '<input><input>'
        const connect = vi.fn()
        const loader = vi.fn(async () => ({ default: defineListener({ selector: 'input', connect }) }))
        const app = new App({ listeners: [lazyListener('input', loader)] })

        app.mount()
        await flush()

        expect(loader).toHaveBeenCalledOnce()
        expect(connect).toHaveBeenCalledTimes(2)
        expect(connect).toHaveBeenCalledWith(expect.any(HTMLInputElement), { app })
    })

    it('connects a selector-less chunk with the typed element', async () => {
        document.body.innerHTML = '<input value="2026-10-21">'
        const values: string[] = []
        const chunk = defineLazyListener<HTMLInputElement>({ connect: (input) => void values.push(input.value) })

        new App({ listeners: [lazyListener('input', async () => ({ default: chunk }))] }).mount()
        await flush()

        expect(values).toEqual(['2026-10-21'])
    })

    it("runs the chunk listener's cleanup on unmount", async () => {
        document.body.innerHTML = '<input>'
        const cleanup = vi.fn()
        const app = new App({
            listeners: [
                lazyListener('input', async () => ({ default: { selector: 'input', connect: () => cleanup } })),
            ],
        })

        app.mount()
        await flush()
        app.unmount()

        expect(cleanup).toHaveBeenCalledOnce()
    })

    it('retries a chunk whose import failed on the next connect', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.innerHTML = '<input>'
        const connect = vi.fn()
        const loader = vi
            .fn<() => Promise<{ default: Listener }>>()
            .mockRejectedValueOnce(new Error('chunk failed'))
            .mockResolvedValueOnce({ default: { selector: 'input', connect } })
        const app = new App({ listeners: [lazyListener('input', loader)] })

        app.mount()
        await flush()
        expect(error).toHaveBeenCalledWith('Failed to connect "input" listener', expect.any(Element), expect.any(Error))

        app.unmount()
        app.mount()
        await flush()
        expect(loader).toHaveBeenCalledTimes(2)
        expect(connect).toHaveBeenCalledOnce()
    })

    it('rejects a chunk without a default-exported listener', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.innerHTML = '<input>'
        const loader = async () => ({ default: 'nope' as unknown as LazyListener })

        new App({ listeners: [lazyListener('input', loader)] }).mount()
        await flush()

        expect(error).toHaveBeenCalledWith(
            'Failed to connect "input" listener',
            expect.any(Element),
            new TypeError('Listener chunk for "input" has no default-exported listener.')
        )
    })
})
