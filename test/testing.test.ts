/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { App, defineLazyListener, defineListener, defineModule, on } from '../src'
import {
    connectListener,
    connectListenerAsync,
    connectListenerWithoutCleanup,
    mountFixture,
    resetFixtures,
} from '../src/testing'

afterEach(() => {
    resetFixtures()
})

const clicks = defineListener<HTMLButtonElement>({
    selector: 'button',
    connect: (button) => on(button, 'click', () => button.classList.add('clicked')),
})

describe('mountFixture', () => {
    it('renders the markup, starts the modules and connects the listeners', () => {
        const started = vi.fn()

        const app = mountFixture('<button id="go"></button>', {
            modules: [defineModule(started)],
            listeners: [clicks],
        })
        document.getElementById('go')?.click()

        expect(app).toBeInstanceOf(App)
        expect(started).toHaveBeenCalledOnce()
        expect(document.getElementById('go')?.classList.contains('clicked')).toBe(true)
    })

    it('settles async connects through the app', async () => {
        const app = mountFixture('<p></p>', {
            listeners: [{ selector: 'p', connect: async (p) => void p.classList.add('ready') }],
        })

        await app.whenConnected()

        expect(document.querySelector('p')?.classList.contains('ready')).toBe(true)
    })
})

describe('resetFixtures', () => {
    it('disconnects what the fixtures connected and empties the body', () => {
        const disconnected = vi.fn()
        const onDocument = vi.fn()
        mountFixture('<p></p>', {
            listeners: [
                { selector: 'p', connect: () => disconnected },
                { selector: 'body', connect: () => on(document, 'custom', onDocument) },
            ],
        })

        resetFixtures()
        document.dispatchEvent(new Event('custom'))

        expect(disconnected).toHaveBeenCalledOnce()
        expect(onDocument).not.toHaveBeenCalled()
        expect(document.body.innerHTML).toBe('')
    })
})

describe('connectListener', () => {
    it('returns the cleanup of a listener', () => {
        const button = document.createElement('button')
        const cleanup = connectListener(clicks, button)

        cleanup()
        button.click()

        expect(button.classList.contains('clicked')).toBe(false)
    })

    it('passes the app it is given', () => {
        const app = new App({ parameters: { label: 'Hello' } })
        const element = document.createElement('p')

        connectListenerWithoutCleanup(
            {
                connect: (p, { app }) => {
                    p.textContent = app.getParameter<string>('label')
                },
            },
            element,
            app
        )

        expect(element.textContent).toBe('Hello')
    })

    it('throws when a listener leaves no cleanup, or one it was not expected to', () => {
        const element = document.createElement('p')

        expect(() => connectListener({ connect: () => undefined }, element)).toThrow('returned no cleanup')
        expect(() => connectListenerWithoutCleanup({ connect: () => () => undefined }, element)).toThrow(
            'returned a cleanup'
        )
    })

    it('points async listeners to connectListenerAsync()', async () => {
        const lazy = defineLazyListener({ connect: async () => () => undefined })
        const element = document.createElement('p')

        expect(() => connectListener(lazy, element)).toThrow('connectListenerAsync()')
        await expect(connectListenerAsync(lazy, element)).resolves.toBeTypeOf('function')
        await expect(connectListenerAsync({ connect: async () => undefined }, element)).rejects.toThrow(
            'returned no cleanup'
        )
    })
})
