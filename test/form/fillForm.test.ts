/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fillForm, formView } from '../../src/form'
import { USER_FORM } from './fixtures'

const $ = <E extends Element = HTMLInputElement>(selector: string): E => document.querySelector(selector) as E

beforeEach(() => {
    document.body.innerHTML = USER_FORM
})

describe('fillForm', () => {
    it('fills fields, entities, choices and embedded forms', () => {
        const form = formView('user')

        fillForm(
            form,
            {
                name: 'Grace',
                agree: true,
                size: 's',
                tags: ['b'],
                roles: { id: 'b', label: 'Admin' },
                address: { city: 'Toulouse' },
            },
            vi.fn()
        )

        expect(form.field('name').value).toBe('Grace')
        expect(form.field('agree').value).toBe(true)
        expect(form.field('size').value).toBe('s')
        expect(form.field('tags').value).toEqual(['b'])
        expect(form.field('roles').value).toEqual(['b'])
        expect(form.field('address.city').value).toBe('Toulouse')
    })

    it('hands arrays on collections to addItem, one call per entry', () => {
        const addItem = vi.fn()
        const form = formView('user')

        fillForm(form, { phones: [{ number: '03' }, { number: '04' }] }, addItem)

        expect(addItem.mock.calls).toEqual([
            [form.get('phones'), { number: '03' }],
            [form.get('phones'), { number: '04' }],
        ])
    })

    it('fills existing collection items from an object keyed by index', () => {
        fillForm(formView('user'), { phones: { 2: { number: '99' } } }, vi.fn())

        expect($('#user_phones_2_number').value).toBe('99')
        expect($('#user_phones_0_number').value).toBe('01')
    })

    it('skips undefined values and fields that are not rendered', () => {
        fillForm(formView('user'), { name: undefined, siren: '123', address: { zip: '31000' } }, vi.fn())

        expect($('#user_name').value).toBe('Ada')
    })

    it('empties a field given null', () => {
        fillForm(formView('user'), { name: null }, vi.fn())

        expect($('#user_name').value).toBe('')
    })
})
