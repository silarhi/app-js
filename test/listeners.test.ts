/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { byId } from '../src'
import { autoSubmit, checkAll, copyToClipboard, passwordToggle, submitOnce, webauthn } from '../src/listeners'
import { mountFixture, resetFixtures } from '../src/testing'

afterEach(() => {
    resetFixtures()
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

const input = (id: string) => byId(id, HTMLInputElement) as HTMLInputElement
const button = (id: string) => byId(id, HTMLButtonElement) as HTMLButtonElement
const form = (id: string) => byId(id, HTMLFormElement) as HTMLFormElement
const change = (element: HTMLInputElement, checked: boolean) => {
    element.checked = checked
    element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('autoSubmit', () => {
    it('submits the form of a changed field, one joined with the form attribute too', () => {
        mountFixture(
            '<form id="search"><select id="sort" data-autosubmit></select></form><input id="city" form="search" data-autosubmit>',
            { listeners: [autoSubmit()] }
        )
        const submit = vi.spyOn(form('search'), 'requestSubmit').mockImplementation(() => undefined)

        byId('sort')?.dispatchEvent(new Event('change'))
        input('city').dispatchEvent(new Event('change'))

        expect(submit).toHaveBeenCalledTimes(2)
    })

    it('submits on the event it is given', () => {
        mountFixture('<form id="otp"><div id="code" data-otp-autosubmit></div></form>', {
            listeners: [autoSubmit({ selector: '[data-otp-autosubmit]', event: 'complete.bs.otpInput' })],
        })
        const submit = vi.spyOn(form('otp'), 'requestSubmit').mockImplementation(() => undefined)

        byId('code')?.dispatchEvent(new Event('change'))
        byId('code')?.dispatchEvent(new Event('complete.bs.otpInput'))

        expect(submit).toHaveBeenCalledOnce()
    })
})

describe('submitOnce', () => {
    const PAGE =
        '<form id="order" data-submit-once><button id="send">Send</button><button id="help" type="button"></button>' +
        '<button id="off" disabled></button></form><button id="outside" form="order"></button>'

    beforeEach(() => {
        vi.useFakeTimers()
    })

    const submit = (cancel = false) => {
        const event = new Event('submit', { cancelable: true })
        form('order').dispatchEvent(event)
        if (cancel) {
            event.preventDefault()
        }
        vi.runAllTimers()
    }

    it('disables the submit buttons of a form once it submits', () => {
        mountFixture(PAGE, { listeners: [submitOnce()] })

        submit()

        expect(button('send').disabled).toBe(true)
        expect(button('outside').disabled).toBe(true)
        expect(button('help').disabled).toBe(false)
        expect(form('order').getAttribute('aria-busy')).toBe('true')
    })

    it('disables nothing when a handler cancelled the submission', () => {
        mountFixture(PAGE, { listeners: [submitOnce()] })

        submit(true)

        expect(button('send').disabled).toBe(false)
    })

    it('locks on a Turbo submission, and releases what it disabled once it ends', () => {
        mountFixture(PAGE, { listeners: [submitOnce()] })

        form('order').dispatchEvent(new Event('turbo:submit-start'))
        expect(button('send').disabled).toBe(true)

        form('order').dispatchEvent(new Event('turbo:submit-end'))
        expect(button('send').disabled).toBe(false)
        expect(button('off').disabled).toBe(true)
        expect(form('order').hasAttribute('aria-busy')).toBe(false)
    })

    it('releases the buttons when the page comes back from the cache, or the form is unmounted', () => {
        const app = mountFixture(PAGE, { listeners: [submitOnce()] })

        submit()
        window.dispatchEvent(new Event('pageshow'))
        expect(button('send').disabled).toBe(false)

        submit()
        app.unmount(form('order'))
        expect(button('send').disabled).toBe(false)
    })
})

describe('checkAll', () => {
    const PAGE =
        '<div data-check-all><input type="checkbox" id="all" data-check-all-master>' +
        '<input type="checkbox" id="a" data-check-all-item><input type="checkbox" id="b" data-check-all-item>' +
        '<input type="checkbox" id="locked" data-check-all-item disabled>' +
        '<form id="delete" data-check-all-action></form></div>'

    it('hides the actions until an item is checked', () => {
        mountFixture(PAGE, { listeners: [checkAll()] })
        expect(form('delete').classList.contains('hidden')).toBe(true)

        change(input('a'), true)

        expect(form('delete').classList.contains('hidden')).toBe(false)
        expect(input('all').checked).toBe(false)
        expect(input('all').indeterminate).toBe(true)
    })

    it('checks every enabled item from the master, and back', () => {
        mountFixture(PAGE, { listeners: [checkAll()] })

        change(input('all'), true)
        expect([input('a').checked, input('b').checked, input('locked').checked]).toEqual([true, true, false])
        expect(input('all').indeterminate).toBe(false)

        change(input('b'), false)
        expect(input('all').checked).toBe(false)

        change(input('b'), true)
        expect(input('all').checked).toBe(true)
    })

    it('counts the items added after it connected', () => {
        mountFixture(PAGE, { listeners: [checkAll()] })
        change(input('all'), true)

        byId('delete')?.insertAdjacentHTML('beforebegin', '<input type="checkbox" id="c" data-check-all-item>')
        change(input('c'), false)

        expect(input('all').indeterminate).toBe(true)
    })

    it('takes the selectors it is given', () => {
        mountFixture(
            '<div class="check-all-container"><input type="checkbox" id="all" class="check-all">' +
                '<input type="checkbox" id="a" class="check-item"></div>',
            { listeners: [checkAll({ selector: '.check-all-container', master: '.check-all', item: '.check-item' })] }
        )

        change(input('all'), true)

        expect(input('a').checked).toBe(true)
    })
})

describe('passwordToggle', () => {
    const PAGE =
        '<form id="login"><input id="password" type="password">' +
        '<button type="button" id="eye" data-password-toggle aria-controls="password" aria-pressed="false" ' +
        'data-label-show="Show" data-label-hide="Hide" title="Show">' +
        '<i id="show" data-password-toggle-icon="show"></i><i id="hide" class="hidden" data-password-toggle-icon="hide"></i>' +
        '</button></form>'

    it('shows and hides the password, with the label and icon of the next click', () => {
        mountFixture(PAGE, { listeners: [passwordToggle()] })

        button('eye').click()
        expect(input('password').type).toBe('text')
        expect(button('eye').getAttribute('aria-pressed')).toBe('true')
        expect(button('eye').getAttribute('aria-label')).toBe('Hide')
        expect(button('eye').title).toBe('Hide')
        expect(byId('show')?.classList.contains('hidden')).toBe(true)
        expect(byId('hide')?.classList.contains('hidden')).toBe(false)

        button('eye').click()
        expect(input('password').type).toBe('password')
        expect(button('eye').getAttribute('aria-label')).toBe('Show')
    })

    it('hides the password before the form sends, and when it is unmounted', () => {
        const app = mountFixture(PAGE, { listeners: [passwordToggle()] })

        button('eye').click()
        form('login').dispatchEvent(new Event('submit'))
        expect(input('password').type).toBe('password')

        button('eye').click()
        app.unmount()
        expect(input('password').type).toBe('password')
    })

    it('finds the field next to a button that names none', () => {
        mountFixture(
            '<div><input id="password" type="password"><button type="button" id="eye" data-password-toggle></button></div>',
            { listeners: [passwordToggle()] }
        )

        button('eye').click()

        expect(input('password').type).toBe('text')
    })
})

describe('copyToClipboard', () => {
    const stubClipboard = (writeText: (text: string) => Promise<void>) =>
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

    it('copies the text a button carries, or the one of its target', async () => {
        const writeText = vi.fn(async (_text: string) => undefined)
        stubClipboard(writeText)
        const copied = vi.fn()
        mountFixture(
            '<button id="link" data-copy="https://by-night.fr/e/42"></button>' +
                '<input id="iban" value="FR76 3000"><button id="iban-copy" data-copy-target="#iban"></button>' +
                '<code id="token"> abc </code><button id="token-copy" data-copy-target="#token"></button>',
            { listeners: [copyToClipboard({ onSuccess: (_button, text) => copied(text) })] }
        )

        button('link').click()
        button('iban-copy').click()
        button('token-copy').click()
        await vi.waitFor(() => expect(copied).toHaveBeenCalledTimes(3))

        expect(copied.mock.calls).toEqual([['https://by-night.fr/e/42'], ['FR76 3000'], ['abc']])
    })

    it('hands the failure over, even without a clipboard', async () => {
        vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
        const failed = vi.fn()
        mountFixture('<button id="link" data-copy="x"></button>', {
            listeners: [copyToClipboard({ onError: (_button, error) => failed(error) })],
        })

        button('link').click()

        await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(expect.any(TypeError)))
    })
})

describe('webauthn', () => {
    const PAGE =
        '<form id="passkey" data-webauthn-action="register" data-webauthn-options=\'{"challenge":"AQID","user":{"id":"BAU","name":"jo","displayName":"Jo"},"rp":{"name":"by-night"},"pubKeyCredParams":[]}\'>' +
        '<input id="response" type="hidden" data-webauthn-response><p id="error" data-webauthn-error hidden></p></form>'

    class FakeCredential {
        id = 'cred'
        type = 'public-key'
        rawId = new Uint8Array([251, 255]).buffer
        response = {
            clientDataJSON: new Uint8Array([1]).buffer,
            attestationObject: new Uint8Array([2]).buffer,
            getTransports: () => ['internal'],
        }
    }

    const submit = () => form('passkey').dispatchEvent(new Event('submit', { cancelable: true }))

    it('registers a passkey and submits its answer', async () => {
        const create = vi.fn(async (_options: CredentialCreationOptions) => new FakeCredential())
        vi.stubGlobal('PublicKeyCredential', FakeCredential)
        vi.stubGlobal('navigator', { ...navigator, credentials: { create } })
        mountFixture(PAGE, { listeners: [webauthn()] })
        const sent = vi.spyOn(form('passkey'), 'submit').mockImplementation(() => undefined)

        submit()
        await vi.waitFor(() => expect(sent).toHaveBeenCalledOnce())

        const publicKey = create.mock.calls[0][0].publicKey as PublicKeyCredentialCreationOptions
        expect([...new Uint8Array(publicKey.challenge as ArrayBuffer)]).toEqual([1, 2, 3])
        expect([...new Uint8Array(publicKey.user.id as ArrayBuffer)]).toEqual([4, 5])
        expect(JSON.parse(input('response').value)).toEqual({
            id: 'cred',
            type: 'public-key',
            rawId: '-_8',
            response: { clientDataJSON: 'AQ', attestationObject: 'Ag', transports: ['internal'] },
        })
    })

    it('shows why it failed, in the messages it is given', async () => {
        const create = vi.fn(async () => {
            throw new DOMException('Cancelled', 'NotAllowedError')
        })
        vi.stubGlobal('PublicKeyCredential', FakeCredential)
        vi.stubGlobal('navigator', { ...navigator, credentials: { create } })
        mountFixture(PAGE, { listeners: [webauthn({ messages: { notAllowed: 'Réessayez.' } })] })

        submit()

        await vi.waitFor(() => expect(byId('error')?.textContent).toBe('Réessayez.'))
        expect(byId('error')?.hidden).toBe(false)
    })

    it('says when the browser has no passkeys', () => {
        vi.stubGlobal('PublicKeyCredential', undefined)
        mountFixture(PAGE, { listeners: [webauthn()] })

        submit()

        expect(byId('error')?.textContent).toBe('Your browser does not support passkeys.')
    })
})
