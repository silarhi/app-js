/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import {
    block,
    type FormCollection,
    FormDefinition,
    type FormField,
    type FormPath,
    type FormView,
    formView,
    type RequiredFormPath,
} from '../../src/form'
import { USER_FORM } from './fixtures'

/** The shape of `USER_FORM`; `siren` depends on an option and is not rendered there. */
interface UserForm {
    name: FormField
    start_date: FormField
    agree: FormField
    address: { city: FormField }
    size: FormField
    tags: FormField
    roles: FormField
    phones: FormCollection<{ number: FormField }>
    notes: FormCollection<FormField>
    siren?: FormField
    company?: { name: FormField }
}

beforeEach(() => {
    document.body.innerHTML = USER_FORM
})

describe('find()', () => {
    it('returns the node when it is rendered, null otherwise', () => {
        const form = formView('user')

        expect(form.find('address.city')).toBe(form.get('address.city'))
        expect(form.find('siren')).toBeNull()
        expect(form.find('address.zip')).toBeNull()
    })
})

describe('typed paths', () => {
    it('lists the paths of a shape', () => {
        expectTypeOf<RequiredFormPath<{ a: FormField; b?: FormField; c: { d: FormField } }>>().toEqualTypeOf<
            'a' | 'c' | 'c.d'
        >()
        expectTypeOf<FormPath<{ a: FormField; b?: FormField }>>().toEqualTypeOf<'a' | 'b'>()
        expectTypeOf<RequiredFormPath<{ items: FormCollection<{ x: FormField }> }>>().toEqualTypeOf<
            'items' | `items.${number}` | `items.${number}.x`
        >()
    })

    it('checks paths and follows them in return types', () => {
        const form = formView<UserForm>('user')

        expect(form.get('address.city').id).toBe('user_address_city')
        expect(form.get('phones.2.number').id).toBe('user_phones_2_number')
        expect(form.get('phones').get('0.number').id).toBe('user_phones_0_number')
        expect(form.get('address').get('city').id).toBe('user_address_city')
        expect(form.find('company.name')).toBeNull()
        expect(form.has('siren')).toBe(false)

        expectTypeOf(form.get('address')).toEqualTypeOf<FormView<{ city: FormField }>>()
        expectTypeOf(form.get('phones.0')).toEqualTypeOf<FormView<{ number: FormField }>>()
        expectTypeOf(form.get('phones').children).toEqualTypeOf<FormView<{ number: FormField }>[]>()
        expectTypeOf(form.find('siren')).toEqualTypeOf<FormView<FormField> | null>()

        const mistakes = (): void => {
            // @ts-expect-error a typo
            form.get('adress.city')
            // @ts-expect-error not a field of an item
            form.get('phones.0.city')
            // @ts-expect-error not always rendered: through find()
            form.get('siren')
            // @ts-expect-error below a node that is not always rendered
            form.get('company.name')
            // @ts-expect-error a leaf has no children
            form.get('name.first')
            // @ts-expect-error find() checks the names too
            form.find('sirne')
            // @ts-expect-error an item has no `city`
            form.get('phones').get('0.city')
        }
        expect(mistakes).toBeTypeOf('function')
    })

    it('leaves an untyped form as it was', () => {
        const form = formView('user')

        expect(form.get('address').get('city').id).toBe('user_address_city')
        expectTypeOf(form.get).parameter(0).toEqualTypeOf<string>()
    })

    it('checks the targets of a typed FormDefinition', () => {
        const form = formView<UserForm>('user')
        const definition = new FormDefinition({ form })

        definition.when('agree').isChecked().showAndRequire('address.city', block('start_date'))
        const siren = form.find('siren')
        if (siren) {
            definition.when('agree').isChecked().show(siren)
        }
        expect(definition.rules).toHaveLength(4)

        const mistakes = (): void => {
            // @ts-expect-error a typo in the source
            definition.when('agre')
            // @ts-expect-error a typo in a target
            definition.when('agree').isChecked().show('adress.city')
            // @ts-expect-error a typo in a block
            definition.when('agree').isChecked().show(block('start_dat'))
            // @ts-expect-error an optional field: through form.find()
            definition.when('agree').isChecked().show('siren')
        }
        expect(mistakes).toBeTypeOf('function')
    })

    it('keeps element ids untyped without a form', () => {
        const definition = new FormDefinition()

        expectTypeOf<string>().toExtend<Parameters<typeof definition.when>[0]>()
    })
})
