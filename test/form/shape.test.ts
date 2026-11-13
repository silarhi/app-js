/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { App } from '../../src/App'
import {
    block,
    CollectionManager,
    type Field,
    type FieldValue,
    type FormCollection,
    FormDefinition,
    type FormField,
    type FormPath,
    type FormValue,
    type FormValues,
    type FormView,
    fillForm,
    formView,
    type RequiredFormPath,
} from '../../src/form'
import { USER_FORM } from './fixtures'

/** The shape of `USER_FORM`; `siren` depends on an option and is not rendered there. */
interface UserForm {
    name: FormField<HTMLInputElement, string>
    start_date: FormField
    agree: FormField<HTMLInputElement, boolean>
    address: { city: FormField }
    size: FormField<HTMLElement, string>
    tags: FormField<HTMLElement, string[]>
    roles: FormField<HTMLSelectElement, string[]>
    phones: FormCollection<{ number: FormField<HTMLInputElement> }>
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
        expectTypeOf(form.get('phones.0')).toEqualTypeOf<FormView<{ number: FormField<HTMLInputElement> }>>()
        expectTypeOf(form.get('phones').children).toEqualTypeOf<FormView<{ number: FormField<HTMLInputElement> }>[]>()
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
        expectTypeOf(form.get('roles').element).toEqualTypeOf<HTMLElement | null>()
        expectTypeOf(form.field('roles')).toEqualTypeOf<Field<HTMLElement>>()
    })
})

describe('typed elements', () => {
    it('types the element a field names', () => {
        const form = formView<UserForm>('user')

        expect(form.get('roles').element?.multiple).toBe(true)
        expect(form.field('roles').element?.selectedOptions).toHaveLength(1)
        expect(form.get('phones.0.number').element?.value).toBe('01')

        expectTypeOf(form.get('roles').element).toEqualTypeOf<HTMLSelectElement | null>()
        expectTypeOf(form.field('agree')).toEqualTypeOf<Field<HTMLInputElement, boolean>>()
        expectTypeOf(form.get('roles').field()).toEqualTypeOf<Field<HTMLSelectElement, string[]>>()
        // A form, a collection, a field without one: an HTMLElement
        expectTypeOf(form.get('address').element).toEqualTypeOf<HTMLElement | null>()
        expectTypeOf(form.get('phones').element).toEqualTypeOf<HTMLElement | null>()
        expectTypeOf(form.field('size').element).toEqualTypeOf<HTMLElement | null>()
    })
})

describe('typed field values', () => {
    it('types the value a field names', () => {
        const form = formView<UserForm>('user')

        expect(form.field('tags').value).toEqual(['a', 'c'])
        expect(form.field('agree').value).toBe(false)
        form.field('name').setValue(3)
        form.field('roles').setValue(null)

        expectTypeOf(form.field('tags').value).toEqualTypeOf<string[]>()
        expectTypeOf(form.field('agree').value).toEqualTypeOf<boolean>()
        expectTypeOf(form.field('size').value).toEqualTypeOf<string>()
        expectTypeOf(form.field('start_date').value).toEqualTypeOf<FieldValue>()
        expectTypeOf(formView('user').field('tags').value).toEqualTypeOf<FieldValue>()

        const mistakes = (): void => {
            // @ts-expect-error a checkbox takes a boolean
            form.field('agree').setValue('yes')
            // @ts-expect-error a multiple choice takes an array
            form.field('tags').setValue(true)
        }
        expect(mistakes).toBeTypeOf('function')
    })

    it('types the conditions of a rule on its source', () => {
        const definition = new FormDefinition({ form: formView<UserForm>('user') })

        definition.when('size').equals('m').show('address.city')
        definition.when('tags').includes('a').show('name')
        definition.when('agree').isChecked().show('name')
        definition.when('start_date').isChecked().show('name')
        definition
            .when('name')
            .select((input) => input.value.length > 3)
            .equals(true)
            .show('address.city')
        expect(definition.rules).toHaveLength(5)

        const mistakes = (): void => {
            // @ts-expect-error a choice of strings is never true
            definition.when('size').equals(true)
            // @ts-expect-error includes() is for an array value
            definition.when('size').includes('m')
            // @ts-expect-error not a checkbox
            definition.when('name').isChecked()
            // @ts-expect-error an option is a string
            definition.when('tags').includes(1)
        }
        expect(mistakes).toBeTypeOf('function')
    })
})

describe('typed values', () => {
    it('keys values like the fields of the shape', () => {
        expectTypeOf<FormValues<{ a: FormField; b: { c: FormField } }>>().toEqualTypeOf<{
            a?: FormValue
            b?: { c?: FormValue }
        }>()
        expectTypeOf<FormValues<{ items: FormCollection<{ x: FormField }> }>>().toEqualTypeOf<{
            items?: Array<{ x?: FormValue }>
        }>()
    })

    it('checks what fills a typed form or collection', () => {
        const form = formView<UserForm>('user')
        const collections = new CollectionManager({ app: new App() })
        const added = collections.add(form.get('phones'), { number: '0607' })
        collections.each(form.get('phones'), ({ form: item }) => {
            expectTypeOf(item).toEqualTypeOf<FormView<{ number: FormField<HTMLInputElement> }>>()
        })
        fillForm(form, { name: 'Grace', address: { city: 'Paris' }, phones: [{ number: '0708' }] }, () => {})

        expect(added.querySelector('input')?.value).toBe('0607')
        expect(form.field('address.city').value).toBe('Paris')

        const mistakes = (): void => {
            // @ts-expect-error a typo in an item field
            collections.add(form.get('phones'), { numbr: '0607' })
            // @ts-expect-error an embedded form takes an object
            fillForm(form, { address: 'Paris' }, () => {})
            // @ts-expect-error a typo in a field
            fillForm(form, { nmae: 'Grace' }, () => {})
            // @ts-expect-error a checkbox takes a boolean
            fillForm(form, { agree: 'yes' }, () => {})
        }
        expect(mistakes).toBeTypeOf('function')
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
