/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { bootstrapTheme, Field, FieldNotFoundError, FormView, formView } from '../../src/form'
import { USER_FORM } from './fixtures'

const $ = <E extends Element = HTMLInputElement>(selector: string): E => document.querySelector(selector) as E

beforeEach(() => {
    document.body.innerHTML = USER_FORM
})

describe('navigation', () => {
    it('roots on a form id, a <form> or a container', () => {
        expect(formView('user').get('name').element).toBe($('#user_name'))
        expect(formView($<HTMLFormElement>('form')).get('name').id).toBe('user_name')
        expect(formView($('#user_address')).get('city').fullName).toBe('user[address][city]')
    })

    it('resolves paths, step by step or at once', () => {
        const form = formView('user')

        expect(form.get('address.city')).toBe(form.get('address').get('city'))
        expect(form.get('phones.2.number').id).toBe('user_phones_2_number')
        expect(form.get('start_date').fullName).toBe('user[start_date]')
        expect(form.get('')).toBe(form)
    })

    it('knows its name, path, parent and root', () => {
        const form = formView('user')
        const city = form.get('address.city')

        expect([city.name, city.path]).toEqual(['city', 'address.city'])
        expect(city.parent).toBe(form.get('address'))
        expect(city.root).toBe(form)
    })

    it('tells rendered fields apart', () => {
        const form = formView('user')

        expect(form.has('address.city')).toBe(true)
        expect(form.has('notes')).toBe(true)
        expect(form.has('siren')).toBe(false)
        expect(form.has('address.zip')).toBe(false)
    })

    it('finds an embedded form rendered without its wrapper', () => {
        $('#user_address').replaceWith(...$('#user_address').childNodes)

        expect(formView('user').has('address')).toBe(true)
    })

    it('suggests the closest names for a missing field', () => {
        const form = formView('user')

        expect(() => form.get('adress')).toThrow('No field "adress" in "user". Did you mean this: "address"?')
        expect(() => form.get('address.citty')).toThrow(
            'No field "citty" in "user[address]". Did you mean this: "city"?'
        )
    })

    it('throws a FieldNotFoundError carrying the path and suggestions', () => {
        let error: unknown
        try {
            formView('user').get('address.citty')
        } catch (caught) {
            error = caught
        }

        expect(error).toBeInstanceOf(FieldNotFoundError)
        expect(error).toBeInstanceOf(ReferenceError)
        expect(error).toMatchObject({ name: 'FieldNotFoundError', path: 'address.citty', suggestions: ['city'] })
    })

    it('lists children in document order, from names or option ids', () => {
        const form = formView('user')

        expect(form.children.map((child) => child.name)).toEqual([
            'name',
            'start_date',
            'agree',
            'address',
            'size',
            'tags',
            'roles',
            'phones',
            '_token',
        ])
        expect(form.get('phones').children.map((child) => child.name)).toEqual(['0', '2'])
        expect(form.get('size').children.map((child) => child.id)).toEqual(['user_size_0', 'user_size_1'])
        expect(form.get('notes').children).toEqual([])
    })

    it('tells which child an element belongs to, from the names inside it', () => {
        const form = formView('user')
        const phones = form.get('phones')

        expect(phones.childOf($('#user_phones_2_number').parentElement as Element)).toBe(phones.get('2'))
        expect(phones.childOf($('#user_phones_0_number'))).toBe(phones.get('0'))
        expect(form.childOf($('#user_address'))).toBe(form.get('address'))
        expect(phones.childOf($('#outside'))).toBeNull()
    })

    it('tells children of an unnamed root apart', () => {
        document.body.innerHTML = '<form><div id="row"><input id="phones_0_n" name="phones[0][n]"></div></form>'

        expect(formView(document.forms[0]).childOf($('#row'))?.name).toBe('phones')
    })

    it('sees items added after it was created', () => {
        const form = formView('user')
        form.get('phones').children
        $('#user_phones').insertAdjacentHTML(
            'beforeend',
            '<input id="user_phones_3_number" name="user[phones][3][number]">'
        )

        expect(form.get('phones').children.map((child) => child.name)).toEqual(['0', '2', '3'])
        expect(form.get('phones.3.number').element).toBe($('#user_phones_3_number'))
    })

    it('scopes lookups to a root', () => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<form name="user"><input id="user_extra" name="user[extra]"></form>'
        )
        const second = formView(document.forms[1])

        expect(second.has('extra')).toBe(true)
        expect(second.has('name')).toBe(false)
    })

    it('reads a container name from its prototype or its fields', () => {
        expect(FormView.fromElement($('#user_notes')).fullName).toBe('user[notes]')
        expect(FormView.fromElement($('#user_address')).fullName).toBe('user[address]')
        expect(FormView.fromElement($('#user_roles')).fullName).toBe('user[roles]')
        expect(FormView.fromElement(document.createElement('div')).fullName).toBe('')
    })

    it('supports unnamed root forms', () => {
        document.body.innerHTML =
            '<form><input id="city" name="city"><input id="phones_0_n" name="phones[0][n]"></form>'
        const form = formView(document.forms[0])

        expect(form.get('city').element).toBe($('#city'))
        expect(form.get('phones.0.n').id).toBe('phones_0_n')
        expect(form.children.map((child) => child.name)).toEqual(['city', 'phones'])
    })
})

describe('field()', () => {
    it('returns one live Field per node', () => {
        const form = formView('user')
        const city = form.field('address.city')

        expect(city).toBeInstanceOf(Field)
        expect(city).toBe(form.get('address').field('city'))
        expect(city).toBe(form.get('address.city').field())

        $('#user_address_city').replaceWith(
            Object.assign(document.createElement('input'), { id: 'user_address_city', value: 'new' })
        )

        expect(city.value).toBe('new')
    })

    it('reads expanded choices and groups through the node', () => {
        const form = formView('user')

        expect(form.field('size').value).toBe('m')
        expect(form.field('size.0').inputs).toHaveLength(2)
        expect(form.field('size.0').value).toBe('m')
        expect(form.field('tags').value).toEqual(['a', 'c'])
        expect(form.field('address').inputs).toEqual([])
    })

    it('passes its options down to the field', () => {
        formView('user', { field: { behavior: bootstrapTheme({ hiddenClass: 'd-none', groupSelector: '#user' }) } })
            .field('name')
            .hide()

        expect($('#user').classList.contains('d-none')).toBe(true)
    })

    it('throws for a missing path', () => {
        expect(() => formView('user').field('zip')).toThrow('No field "zip" in "user".')
    })
})
