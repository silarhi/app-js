/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    bindField,
    bootstrapTheme,
    Field,
    type FieldBehavior,
    type FormControl,
    getFieldDefaults,
    setFieldDefaults,
} from '../../src/form'
import { USER_FORM } from './fixtures'

const $ = <E extends Element = HTMLInputElement>(selector: string): E => document.querySelector(selector) as E

beforeEach(() => {
    document.body.innerHTML = USER_FORM
})

describe('sources', () => {
    it('wraps a single control', () => {
        const name = new Field($('#user_name'))

        expect(name.element).toBe($('#user_name'))
        expect(name.inputs).toEqual([$('#user_name')])
        expect(name.expanded).toBe(false)
        expect(name.value).toBe('Ada')
    })

    it('expands a radio to its whole group', () => {
        const size = new Field($('#user_size_0'))

        expect(size.inputs).toHaveLength(2)
        expect(size.expanded).toBe(true)
        expect(size.value).toBe('m')
    })

    it('finds a radio group outside a form', () => {
        document.body.innerHTML =
            '<input id="a" type="radio" name="g" value="1"><input type="radio" name="g" value="2">'

        expect(new Field($('#a')).inputs).toHaveLength(2)
    })

    it('reads the controls of a container', () => {
        const tags = new Field($('#user_tags'))

        expect(tags.inputs).toHaveLength(3)
        expect(tags.expanded).toBe(true)
        expect(tags.value).toEqual(['a', 'c'])
    })

    it('takes explicit inputs: one is a plain field, several an expanded choice', () => {
        expect(new Field([$('#user_agree')]).value).toBe(false)
        expect(new Field([$('#user_tags_0'), $('#user_tags_1')]).value).toEqual(['a'])
    })

    it('follows resolvers on every access', () => {
        let current = $<FormControl>('#user_name')
        const field = new Field({ element: () => current, inputs: () => [current] })

        current = $('#user_start_date')
        field.setValue('2026-10-21')

        expect($('#user_start_date').value).toBe('2026-10-21')
        expect($('#user_name').value).toBe('Ada')
    })
})

describe('values', () => {
    it('reads every kind of field', () => {
        expect(new Field($('#user_agree')).value).toBe(false)
        expect(new Field($('#user_roles')).value).toEqual(['a'])
        expect(new Field(document.createElement('div')).value).toBeUndefined()
        expect(new Field([]).value).toBeUndefined()
    })

    it('reads an expanded radio group with nothing checked as an empty string', () => {
        $('#user_size_1').checked = false

        expect(new Field($('#user_size')).value).toBe('')
    })

    it('writes every kind of field', () => {
        const fields = {
            name: new Field($('#user_name')),
            agree: new Field($('#user_agree')),
            size: new Field($('#user_size')),
            tags: new Field($('#user_tags')),
            roles: new Field($('#user_roles')),
        }

        fields.name.setValue('Grace')
        fields.agree.setValue(true)
        fields.size.setValue('s')
        fields.tags.setValue(['b'])
        fields.roles.setValue(['b'])
        new Field([]).setValue('ignored')

        expect(Object.values(fields).map((field) => field.value)).toEqual(['Grace', true, 's', ['b'], ['b']])
    })

    it('empties text and unchecks choices', () => {
        const fields = ['#user_name', '#user_agree', '#user_size', '#user_tags'].map((id) => new Field($(id)))
        fields[1].setValue(true)

        for (const field of fields) {
            field.empty()
        }

        expect(fields.map((field) => field.value)).toEqual(['', false, '', []])
    })

    it('listens on every input until removed', () => {
        const handler = vi.fn()
        const off = new Field($('#user_tags')).onChange(handler)

        $('#user_tags_0').dispatchEvent(new Event('change'))
        $('#user_tags_1').dispatchEvent(new Event('change'))
        off()
        $('#user_tags_0').dispatchEvent(new Event('change'))

        expect(handler).toHaveBeenCalledTimes(2)
    })
})

describe('change notifications', () => {
    let listeners: AbortController

    beforeEach(() => {
        listeners = new AbortController()
    })

    afterEach(() => {
        listeners.abort()
    })

    function changes(type = 'change'): HTMLElement[] {
        const targets: HTMLElement[] = []
        document.addEventListener(type, (event) => targets.push(event.target as HTMLElement), {
            signal: listeners.signal,
        })
        return targets
    }

    it('fires input before change, both bubbling', () => {
        const order: string[] = []
        for (const type of ['input', 'change']) {
            document.addEventListener(
                type,
                (event) => order.push(`${event.type} ${(event.target as HTMLElement).id}`),
                {
                    signal: listeners.signal,
                }
            )
        }

        new Field($('#user_name')).setValue('Grace')
        new Field($('#user_name')).setValue('Grace', { silent: true })

        expect(order).toEqual(['input user_name', 'change user_name'])
    })

    it('fires a bubbling change on the input it changed', () => {
        const targets = changes()

        new Field($('#user_name')).setValue('Grace')

        expect(targets).toEqual([$('#user_name')])
    })

    it('stays quiet when nothing changed, or when silent', () => {
        const targets = changes()
        const name = new Field($('#user_name'))

        name.setValue('Ada')
        name.setValue('Grace', { silent: true })
        name.empty({ silent: true })

        expect(targets).toEqual([])
        expect(name.value).toBe('')
    })

    it('reports only the options of an expanded choice that changed', () => {
        const targets = changes()

        new Field($('#user_tags')).setValue(['a', 'b'])

        expect(targets).toEqual([$('#user_tags_1'), $('#user_tags_2')])
    })

    it('reports only the radio that got checked', () => {
        const targets = changes()

        new Field($('#user_size')).setValue('s')

        expect(targets).toEqual([$('#user_size_0')])
    })

    it('notifies when emptying', () => {
        const targets = changes()

        new Field($('#user_name')).empty()
        new Field($('#user_tags')).empty()

        expect(targets).toEqual([$('#user_name'), $('#user_tags_0'), $('#user_tags_2')])
    })

    it('leaves notifying to a bound behavior, telling it whether to', () => {
        const targets = changes()
        const calls: Array<[unknown, boolean]> = []
        bindField($('#user_roles'), { setValue: ({ value, silent }) => void calls.push([value, silent]) })
        const roles = new Field($('#user_roles'))

        roles.setValue(['b'])
        roles.empty({ silent: true })

        expect(calls).toEqual([
            [['b'], false],
            [null, true],
        ])
        expect(targets).toEqual([])
    })
})

describe('multiple selects', () => {
    beforeEach(() => {
        $('#user_roles').insertAdjacentHTML('afterbegin', '<option value="">None</option>')
    })

    it('reads and writes arrays, notifying once', () => {
        const roles = new Field($('#user_roles'))
        const change = vi.fn()
        $('#user_roles').addEventListener('change', change)

        roles.setValue(['a', 'b'])

        expect(roles.value).toEqual(['a', 'b'])
        expect(change).toHaveBeenCalledOnce()
    })

    it('empties to no selection, even with an empty option', () => {
        const roles = new Field($('#user_roles'))

        roles.empty()

        expect(roles.value).toEqual([])
    })

    it('empties a single select to its placeholder', () => {
        document.body.innerHTML =
            '<select id="s"><option value="">Choose</option><option value="a" selected></option></select>'
        const select = new Field($('#s'))

        select.empty()

        expect(select.value).toBe('')
    })
})

describe('element level: bindField', () => {
    /** Stands in for tom-select: the value and the disabled state live in the library instance. */
    function enhance(): { instance: { items: string[]; disabled: boolean }; behavior: FieldBehavior } {
        const instance = { items: ['from-lib'], disabled: false }
        const behavior: FieldBehavior = {
            getValue: () => instance.items,
            setValue: ({ value }) => {
                instance.items = value === null ? [] : ([] as string[]).concat(value as string[])
            },
            setDisabled: ({ disabled }) => {
                instance.disabled = disabled
            },
        }

        return { instance, behavior }
    }

    it('reads, writes, empties and disables through the bound behavior', () => {
        const { instance, behavior } = enhance()
        bindField($('#user_roles'), behavior)
        const roles = new Field($('#user_roles'))

        expect(roles.binding).toBe(behavior)
        expect(roles.value).toEqual(['from-lib'])

        roles.setValue(['a', 'b'])
        expect(instance.items).toEqual(['a', 'b'])

        roles.empty()
        expect(instance.items).toEqual([])

        roles.setDisabled(true)
        expect(instance.disabled).toBe(true)
        expect($<HTMLSelectElement>('#user_roles').disabled).toBe(false)
    })

    it('uses the levels below for the parts it leaves out', () => {
        bindField($('#user_name'), { getValue: () => 'from-lib' })
        const name = new Field($('#user_name'))

        name.setValue('native')
        name.setDisabled(true)

        expect(name.value).toBe('from-lib')
        expect($('#user_name').value).toBe('native')
        expect($('#user_name').disabled).toBe(true)
    })

    it('requires through the binding and still marks the label', () => {
        const setRequired = vi.fn()
        bindField($('#user_name'), { setRequired })
        const name = new Field($('#user_name'))

        name.setRequired(true)

        expect(setRequired).toHaveBeenCalledWith(expect.objectContaining({ field: name, required: true }))
        expect($('#user_name').required).toBe(false)
        expect(name.label?.classList.contains('required')).toBe(true)
    })

    it('listens through the binding', () => {
        const off = vi.fn()
        const on = vi.fn(() => off)
        bindField($('#user_name'), { on })
        const handler = vi.fn()

        const cleanup = new Field($('#user_name')).onChange(handler)
        cleanup()

        expect(on).toHaveBeenCalledWith(expect.objectContaining({ type: 'change', handler }))
        expect(off).toHaveBeenCalledOnce()
    })

    it('reads back required and disabled from the binding', () => {
        bindField($('#user_roles'), { isRequired: () => true, isDisabled: () => true })
        const roles = new Field($('#user_roles'))

        expect([roles.required, roles.disabled]).toEqual([true, true])
    })

    it('calls parts on their behavior, so they can use this', () => {
        const behavior = {
            items: ['kept'],
            getValue(): string[] {
                return this.items
            },
        }
        bindField($('#user_roles'), behavior)

        expect(new Field($('#user_roles')).value).toEqual(['kept'])
    })

    it('finds a binding on an expanded choice container or on the first input', () => {
        bindField($('#user_tags'), { getValue: () => 'container' })
        bindField($('#user_size_0'), { getValue: () => 'first input' })

        expect(new Field($('#user_tags')).value).toBe('container')
        expect(new Field([$('#user_size_0'), $('#user_size_1')]).value).toBe('first input')
    })

    it('stops answering once unbound, without dropping a newer binding', () => {
        const unbindFirst = bindField($('#user_name'), { getValue: () => 'first' })
        const unbindSecond = bindField($('#user_name'), { getValue: () => 'second' })
        const name = new Field($('#user_name'))

        unbindFirst()
        expect(name.value).toBe('second')

        unbindSecond()
        expect(name.value).toBe('Ada')
    })
})

describe('app level: setFieldDefaults', () => {
    it('applies to every field, read on each call, until restored', () => {
        const name = new Field($('#user_name'))
        const restore = setFieldDefaults(bootstrapTheme({ hiddenClass: 'd-none' }))

        try {
            expect(getFieldDefaults()).toHaveLength(1)
            name.hide()
            expect(name.container.classList.contains('d-none')).toBe(true)
        } finally {
            restore()
        }

        name.show()
        name.hide()
        expect(getFieldDefaults()).toEqual([])
        expect(name.container.classList.contains('hidden')).toBe(true)
    })

    it('tries its behaviors in order, each able to defer with next()', () => {
        const restore = setFieldDefaults(
            { getValue: ({ field, next }) => (field.element?.id === 'user_name' ? 'first' : next()) },
            { getValue: ({ field, next }) => (field.element?.id === 'user_start_date' ? 'second' : next()) }
        )

        try {
            expect(new Field($('#user_name')).value).toBe('first')
            expect(new Field($('#user_start_date')).value).toBe('second')
            expect(new Field($('#user_agree')).value).toBe(false)
        } finally {
            restore()
        }
    })

    it('is overridden by the element and field levels', () => {
        const restore = setFieldDefaults({ getValue: () => 'app' })

        try {
            bindField($('#user_name'), { getValue: () => 'element' })
            expect(new Field($('#user_start_date')).value).toBe('app')
            expect(new Field($('#user_name')).value).toBe('element')
            expect(new Field($('#user_name'), { behavior: { getValue: () => 'field' } }).value).toBe('field')
        } finally {
            restore()
        }
    })
})

describe('field level and next()', () => {
    it('wins over every other level', () => {
        const markRequired = vi.fn()
        const name = new Field($('#user_name'), { behavior: { markRequired } })

        name.setRequired(true)

        expect(markRequired).toHaveBeenCalledWith(expect.objectContaining({ label: name.label, required: true }))
        expect(name.label?.classList.contains('required')).toBe(false)
    })

    it('lets a part wrap the level below with next()', () => {
        const name = new Field($('#user_name'), {
            behavior: {
                getValue: ({ next }) => String(next()).toUpperCase(),
                markRequired: ({ label, required, next }) => {
                    next()
                    label.toggleAttribute('data-required', required)
                },
            },
        })

        name.setRequired(true)

        expect(name.value).toBe('ADA')
        expect(name.label?.classList.contains('required')).toBe(true)
        expect(name.label?.hasAttribute('data-required')).toBe(true)
    })

    it('chains next() through the field, element, app and native levels', () => {
        const calls: string[] = []
        const restore = setFieldDefaults({
            getValue: ({ next }) => {
                calls.push('app')
                return next()
            },
        })
        bindField($('#user_name'), {
            getValue: ({ next }) => {
                calls.push('element')
                return next()
            },
        })

        try {
            const value = new Field($('#user_name'), {
                behavior: {
                    getValue: ({ next }) => {
                        calls.push('field')
                        return next()
                    },
                },
            }).value

            expect(calls).toEqual(['field', 'element', 'app'])
            expect(value).toBe('Ada')
        } finally {
            restore()
        }
    })
})

describe('bootstrap theme', () => {
    it('lets the default label follow a group from another level', () => {
        const name = new Field($('#user_name'), {
            behavior: { group: () => $('#user_size').closest('fieldset') },
        })

        expect(name.label?.tagName).toBe('LEGEND')
    })

    it('configures group, hidden and required classes', () => {
        const name = new Field($('#user_name'), {
            behavior: bootstrapTheme({ groupSelector: '#user', hiddenClass: 'd-none', requiredClass: 'is-required' }),
        })

        name.hide()
        name.setRequired(true)

        expect($('#user').classList.contains('d-none')).toBe(true)
        expect($('label[for="user_name"]').classList.contains('is-required')).toBe(true)
    })

    it('marks no label when there is none', () => {
        document.body.innerHTML = '<div class="form-group"><input id="bare"></div>'

        expect(() => new Field($('#bare')).setRequired(true)).not.toThrow()
        expect($('#bare').required).toBe(true)
    })

    it("shows and hides the element itself with 'self'", () => {
        const city = new Field($('#user_address_city'))

        city.setVisible(false, 'self')

        expect($('#user_address_city').classList.contains('hidden')).toBe(true)
        expect(city.container.classList.contains('hidden')).toBe(false)
        expect(() => new Field([]).setVisible(false, 'self')).toThrow('The field has no element to show or hide.')
    })

    it('has no group when none wraps the field', () => {
        expect(new Field($('#outside')).group).toBeNull()
    })
})

describe('behaviour', () => {
    it('finds the form group and its label', () => {
        expect(new Field($('#user_name')).label?.textContent).toBe('Name')
        expect(new Field($('#user_agree')).label?.textContent).toBe('Agree')
        expect(new Field($('#user_size')).label?.tagName).toBe('LEGEND')
        expect(new Field($('#user_tags')).container).toBe($('#user_tags').parentElement)
    })

    it('has no label when none is rendered', () => {
        document.body.innerHTML = '<div class="form-group"><input id="bare" type="checkbox"></div>'
        const detached = document.createElement('input')
        detached.type = 'checkbox'

        expect(new Field($('#bare')).label).toBeNull()
        expect(new Field(detached).label).toBeNull()
    })

    it('throws when no form group wraps the field, naming it as best it can', () => {
        expect(() => new Field($('#outside')).container).toThrow('Unable to find the group of field "outside".')
        expect(() => new Field(Object.assign(document.createElement('input'), { name: 'n' })).container).toThrow(
            'group of field "n".'
        )
        expect(() => new Field(document.createElement('div')).container).toThrow('group of field "DIV".')
        expect(() => new Field([]).container).toThrow('group of field "field".')
    })

    it('requires a control and marks its label', () => {
        const name = new Field($('#user_name'))

        name.setRequired(true)
        expect($('#user_name').required).toBe(true)
        expect(name.label?.classList.contains('required')).toBe(true)

        name.setRequired(false)
        expect($('#user_name').required).toBe(false)
        expect(name.label?.classList.contains('required')).toBe(false)
    })

    it('requires every radio of a group, so one must be picked', () => {
        const size = new Field($('#user_size'))

        size.setRequired(true)

        expect(size.inputs.every((input) => input.required)).toBe(true)
        expect(size.label?.classList.contains('required')).toBe(true)
    })

    it('requires a single checkbox, so it must be checked', () => {
        const agree = new Field($('#user_agree'))

        agree.setRequired(true)

        expect($('#user_agree').required).toBe(true)
        expect(agree.label?.classList.contains('required')).toBe(true)
    })

    it('marks a checkbox group as required instead of each checkbox', () => {
        const tags = new Field($('#user_tags'))

        tags.setRequired(true)
        expect(tags.inputs.some((input) => input.required)).toBe(false)
        expect($('#user_tags').getAttribute('aria-required')).toBe('true')
        expect(tags.label?.classList.contains('required')).toBe(true)

        tags.setRequired(false)
        expect($('#user_tags').hasAttribute('aria-required')).toBe(false)
        expect(tags.label?.classList.contains('required')).toBe(false)
    })

    it('reads back required, through the group for a checkbox group', () => {
        const name = new Field($('#user_name'))
        const tags = new Field($('#user_tags'))

        expect([name.required, tags.required]).toEqual([false, false])

        name.setRequired(true)
        tags.setRequired(true)

        expect([name.required, tags.required]).toEqual([true, true])
    })

    it('reads back disabled once every input is', () => {
        const tags = new Field($('#user_tags'))

        $('#user_tags_0').disabled = true
        expect(tags.disabled).toBe(false)

        tags.setDisabled(true)
        expect(tags.disabled).toBe(true)
        expect(new Field([]).disabled).toBe(false)
    })

    it('reads back required and disabled from a bound controller', () => {
        bindField($('#user_roles'), { isRequired: () => true, isDisabled: () => true })
        const roles = new Field($('#user_roles'))

        expect([roles.required, roles.disabled]).toEqual([true, true])
    })

    it('disables and enables every input', () => {
        const tags = new Field($('#user_tags'))

        tags.setDisabled(true)
        expect(tags.inputs.every((input) => input.disabled)).toBe(true)

        tags.setDisabled(false)
        expect(tags.inputs.some((input) => input.disabled)).toBe(false)
    })

    it('shows and hides its form group with the configured class and group selector', () => {
        const name = new Field($('#user_name'), {
            behavior: bootstrapTheme({ hiddenClass: 'd-none', groupSelector: '#user' }),
        })

        name.hide()
        expect($('#user').classList.contains('d-none')).toBe(true)

        name.show()
        expect($('#user').classList.contains('d-none')).toBe(false)
    })
})
