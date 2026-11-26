/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bindField, bootstrapTheme, formView, setFieldDefaults, showViolations } from '../../src/form'
import type { Cleanup } from '../../src/types'
import { USER_FORM } from './fixtures'

const $ = <E extends Element = HTMLInputElement>(selector: string): E => document.querySelector(selector) as E
const texts = (selector: string): (string | null)[] =>
    [...document.querySelectorAll(selector)].map((element) => element.textContent)

let restoreDefaults: Cleanup | undefined

beforeEach(() => {
    document.body.innerHTML = USER_FORM
})

afterEach(() => {
    restoreDefaults?.()
    restoreDefaults = undefined
})

describe('showViolations', () => {
    it('marks each field invalid and writes its messages after it, in order', () => {
        showViolations(formView('user'), [
            { path: 'name', message: 'Too short.' },
            { path: 'name', message: 'Not valid.' },
            { path: 'phones.2.number', message: 'Not a phone number.' },
        ])

        expect($('#user_name').classList.contains('is-invalid')).toBe(true)
        expect($('#user_phones_0_number').classList.contains('is-invalid')).toBe(false)
        expect($('#user_name').nextElementSibling?.outerHTML).toBe(
            '<div class="invalid-feedback d-block">Too short.</div>'
        )
        expect($('#user_name').nextElementSibling?.nextElementSibling?.textContent).toBe('Not valid.')
        expect($('#user_phones_2_number').nextElementSibling?.textContent).toBe('Not a phone number.')
    })

    it('writes the message of a choice in its container, marking each of its options', () => {
        showViolations(formView('user'), [{ path: 'size', message: 'Pick a size.' }])

        expect($('#user_size').lastElementChild?.textContent).toBe('Pick a size.')
        expect($('#user_size_0').classList.contains('is-invalid')).toBe(true)
        expect($('#user_size_1').classList.contains('is-invalid')).toBe(true)
    })

    it('writes the message after the wrapper Bootstrap puts around a control', () => {
        document.body.innerHTML = `
            <div id="price">
                <div class="input-group"><input id="price_amount" name="price[amount]"><span class="input-group-text">€</span></div>
                <div class="form-check"><input id="price_vat" name="price[vat]" type="checkbox"><label class="form-check-label">VAT</label></div>
            </div>`

        showViolations(formView('price'), [
            { path: 'amount', message: 'Positive.' },
            { path: 'vat', message: 'Required.' },
        ])

        expect($('.input-group').nextElementSibling?.textContent).toBe('Positive.')
        expect($('.form-check').nextElementSibling?.textContent).toBe('Required.')
    })

    it('writes the errors of the form itself, and of the paths no longer rendered, first in it', () => {
        showViolations(formView($<HTMLFormElement>('form')), [
            { path: '', message: 'The user is incomplete.' },
            { path: 'siren', message: 'Removed since.' },
        ])

        expect(texts('#user > .alert')).toEqual(['The user is incomplete.', 'Removed since.'])
        expect($('#user').firstElementChild?.className).toBe('alert alert-danger d-block')
    })

    it('writes the errors of the form in the <form> of its fields when it has no element', () => {
        document.body.innerHTML = '<form><input id="search_q" name="search[q]"></form>'

        showViolations(formView('search'), [{ path: '', message: 'Nothing found.' }])

        expect($('form').firstElementChild?.textContent).toBe('Nothing found.')
    })

    it('writes with the errors of the form those of an embedded form rendered without its wrapper', () => {
        document.body.innerHTML = '<form><input id="user_address_city" name="user[address][city]"></form>'

        showViolations(formView('user'), [{ path: 'address', message: 'Incomplete address.' }])

        expect($('form').firstElementChild?.outerHTML).toBe(
            '<div class="alert alert-danger d-block">Incomplete address.</div>'
        )
    })

    it('writes the errors of the form in the given container', () => {
        document.body.innerHTML = `${USER_FORM}<div id="errors"></div>`

        showViolations(formView('user'), [{ path: '', message: 'Refused.' }], { container: $('#errors') })

        expect(texts('#errors .alert')).toEqual(['Refused.'])
    })

    it('fails without an element to write the errors of the form in', () => {
        document.body.innerHTML = ''

        expect(() => showViolations(formView('user'), [{ path: '', message: 'Refused.' }])).toThrow(
            'No element to show the errors of the form in: pass a container.'
        )
    })

    it('takes the classes the app configures its theme with', () => {
        restoreDefaults = setFieldDefaults(
            bootstrapTheme({ invalidClass: 'error', feedbackClass: 'help is-danger', alertClass: 'notification' })
        )

        showViolations(formView('user'), [
            { path: 'name', message: 'Too short.' },
            { path: '', message: 'Refused.' },
        ])

        expect($('#user_name').classList.contains('error')).toBe(true)
        expect($('#user_name').nextElementSibling?.className).toBe('help is-danger')
        expect($('#user').firstElementChild?.className).toBe('notification')
    })

    it('shows the errors of a field through the part its element is bound to', () => {
        const shown: string[] = []
        bindField($('#user_name'), {
            showErrors: ({ messages, next }) => {
                shown.push(...messages)
                return next()
            },
        })

        showViolations(formView('user'), [{ path: 'name', message: 'Too short.' }])

        expect(shown).toEqual(['Too short.'])
        expect($('#user_name').nextElementSibling?.textContent).toBe('Too short.')
    })

    it('shows the errors of the form through the app part, which may need no container', () => {
        const toasts: string[] = []
        restoreDefaults = setFieldDefaults({
            showFormErrors: ({ messages }) => {
                toasts.push(...messages)
                return () => toasts.splice(0)
            },
        })
        document.body.innerHTML = ''

        const cleanup = showViolations(formView('user'), [{ path: '', message: 'Refused.' }])
        expect(toasts).toEqual(['Refused.'])

        cleanup()
        expect(toasts).toEqual([])
    })

    it('sends the errors of a field with nowhere to show them to the form', () => {
        restoreDefaults = setFieldDefaults({ showErrors: () => null })

        showViolations(formView('user'), [{ path: 'name', message: 'Too short.' }])

        expect(texts('#user > .alert')).toEqual(['Too short.'])
    })

    it('writes a message as text, never as markup', () => {
        showViolations(formView('user'), [{ path: 'name', message: '<img src=x onerror=alert(1)>' }])

        expect($('#user_name').nextElementSibling?.textContent).toBe('<img src=x onerror=alert(1)>')
        expect(document.querySelector('img')).toBeNull()
    })

    it('drops the errors of a field once it is edited again', () => {
        showViolations(formView('user'), [
            { path: 'name', message: 'Too short.' },
            { path: 'address.city', message: 'Required.' },
        ])

        $('#user_name').dispatchEvent(new Event('input', { bubbles: true }))

        expect($('#user_name').classList.contains('is-invalid')).toBe(false)
        expect(texts('.invalid-feedback')).toEqual(['Required.'])
    })

    it('leaves what a later submission showed once a field edited since is cleaned up', () => {
        const cleanup = showViolations(formView('user'), [{ path: 'name', message: 'Too short.' }])
        $('#user_name').dispatchEvent(new Event('input', { bubbles: true }))
        showViolations(formView('user'), [{ path: 'name', message: 'Still too short.' }])

        cleanup()

        expect($('#user_name').classList.contains('is-invalid')).toBe(true)
        expect(texts('.invalid-feedback')).toEqual(['Still too short.'])
    })

    it('removes everything it showed, keeping what the server rendered', () => {
        $('#user_name').classList.add('is-invalid')

        const cleanup = showViolations(formView('user'), [
            { path: 'name', message: 'Too short.' },
            { path: 'agree', message: 'Required.' },
            { path: '', message: 'Refused.' },
        ])
        cleanup()

        expect(document.querySelectorAll('.invalid-feedback, .alert')).toHaveLength(0)
        expect($('#user_name').classList.contains('is-invalid')).toBe(true)
        expect($('#user_agree').classList.contains('is-invalid')).toBe(false)
    })
})
