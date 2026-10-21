/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    bindField,
    block,
    bootstrapTheme,
    Field,
    FieldNotFoundError,
    FormDefinition,
    FormRuleError,
    formView,
} from '../../src/form'

const $ = <E extends Element = HTMLInputElement>(selector: string): E => document.querySelector(selector) as E

const group = (id: string): Element => $(`#${id}`).closest('.form-group') as Element

const hidden = (id: string): boolean => group(id).classList.contains('hidden')

function check(id: string, checked = true): void {
    $(`#${id}`).checked = checked
    $(`#${id}`).dispatchEvent(new Event('change'))
}

function type(id: string, value: string): void {
    $(`#${id}`).value = value
    $(`#${id}`).dispatchEvent(new Event('change'))
}

beforeEach(() => {
    document.body.innerHTML = `
        <div class="form-group"><input id="f_vat" name="f[vat]" type="checkbox"></div>
        <div class="form-group"><label>Date</label><input id="f_date" name="f[date]"></div>
        <div class="form-group"><input id="f_name" name="f[name]"></div>
        <div class="form-group"><input id="f_other" name="f[other]"></div>
        <div class="form-group">
            <div id="f_tags">
                <input id="f_tags_0" name="f[tags][]" type="checkbox" value="a">
                <input id="f_tags_1" name="f[tags][]" type="checkbox" value="b">
            </div>
        </div>
        <div id="box"><input id="f_boxed" name="f[boxed]"></div>`
})

describe('FormDefinition', () => {
    it('shows and requires a field while its rule matches', () => {
        new FormDefinition().when('f_vat').isChecked().showAndRequire('f_date').apply()

        expect(hidden('f_date')).toBe(true)
        expect($('#f_date').required).toBe(false)

        check('f_vat')

        expect(hidden('f_date')).toBe(false)
        expect($('#f_date').required).toBe(true)
        expect($('label').classList.contains('required')).toBe(true)
    })

    it('stops reacting once its cleanup ran', () => {
        const cleanup = new FormDefinition().when('f_vat').isChecked().show('f_date').apply()

        cleanup()
        check('f_vat')

        expect(hidden('f_date')).toBe(true)
    })

    it('compares strictly with equals and notEquals', () => {
        const definition = new FormDefinition()
        definition.when('f_name').equals('a', 'b').show('f_date')
        definition.when('f_name').notEquals('a').show('f_other')
        definition.apply()

        expect([hidden('f_date'), hidden('f_other')]).toEqual([true, false])

        type('f_name', 'a')
        expect([hidden('f_date'), hidden('f_other')]).toEqual([false, true])

        type('f_name', 'b')
        expect([hidden('f_date'), hidden('f_other')]).toEqual([false, false])
    })

    it('tests checkbox groups with includes and notIncludes', () => {
        const definition = new FormDefinition({ form: formView('f') })
        definition.when('tags').includes('b').show('date')
        definition.when('tags').notIncludes('a').show('other')
        definition.apply()

        expect([hidden('f_date'), hidden('f_other')]).toEqual([true, false])

        check('f_tags_0')
        check('f_tags_1')

        expect([hidden('f_date'), hidden('f_other')]).toEqual([false, true])
    })

    it('treats a non-array value as not including anything', () => {
        const definition = new FormDefinition()
        definition.when('f_name').includes('a').show('f_date')
        definition.when('f_name').notIncludes('a').show('f_other')
        definition.apply()

        expect([hidden('f_date'), hidden('f_other')]).toEqual([true, false])
    })

    it('tests truthiness', () => {
        const definition = new FormDefinition()
        definition.when('f_name').isTruthy().show('f_date')
        definition.when('f_name').isFalsy().show('f_other')
        definition.apply()

        expect([hidden('f_date'), hidden('f_other')]).toEqual([true, false])

        type('f_name', 'x')

        expect([hidden('f_date'), hidden('f_other')]).toEqual([false, true])
    })

    it('reads the value through select()', () => {
        new FormDefinition()
            .when('f_name')
            .select((input) => (input.value.length > 3 ? 'long' : 'short'))
            .equals('long')
            .show('f_date')
            .apply()

        type('f_name', 'abc')
        expect(hidden('f_date')).toBe(true)

        type('f_name', 'abcd')
        expect(hidden('f_date')).toBe(false)
    })

    it('ORs rules sharing a target and effect', () => {
        const definition = new FormDefinition()
        definition.when('f_vat').isChecked().show('f_date')
        definition.when('f_name').equals('x').show('f_date')
        definition.apply()

        type('f_name', 'x')

        expect(hidden('f_date')).toBe(false)
    })

    it('lets a matching hide rule win over show rules', () => {
        const definition = new FormDefinition()
        definition.when('f_vat').isChecked().show('f_date')
        definition.when('f_name').equals('x').hide('f_date')
        definition.apply()

        check('f_vat')
        expect(hidden('f_date')).toBe(false)

        type('f_name', 'x')
        expect(hidden('f_date')).toBe(true)
    })

    it('shows a target that only has hide rules while none matches', () => {
        new FormDefinition().when('f_vat').isChecked().hide('f_date').apply()

        expect(hidden('f_date')).toBe(false)

        check('f_vat')

        expect(hidden('f_date')).toBe(true)
    })

    it('disables and requires without touching visibility', () => {
        const definition = new FormDefinition()
        definition.when('f_vat').isChecked().disable('f_name').require('f_other')
        definition.apply()

        check('f_vat')

        expect($('#f_name').disabled).toBe(true)
        expect($('#f_other').required).toBe(true)
        expect(hidden('f_name') || hidden('f_other')).toBe(false)

        check('f_vat', false)

        expect($('#f_name').disabled).toBe(false)
        expect($('#f_other').required).toBe(false)
    })

    it('empties a target while its rule matches', () => {
        new FormDefinition().when('f_vat').isFalsy().empty('f_name').apply()
        expect($('#f_name').value).toBe('')

        check('f_vat')
        type('f_name', 'kept')
        expect($('#f_name').value).toBe('kept')

        check('f_vat', false)
        expect($('#f_name').value).toBe('')
    })

    it('chains when() and apply() from an action', () => {
        const cleanup = new FormDefinition()
            .when('f_vat')
            .isChecked()
            .show('f_date')
            .when('f_name')
            .equals('x')
            .show('f_other')
            .apply()

        expect(typeof cleanup).toBe('function')
        expect([hidden('f_date'), hidden('f_other')]).toEqual([true, true])
    })

    it('accepts elements and block targets', () => {
        const definition = new FormDefinition()
        definition
            .when($('#f_vat'))
            .isChecked()
            .show(formView('f').get('date'), block('f_boxed'), block($('#f_name')))
        definition.apply()

        expect(hidden('f_date')).toBe(true)
        expect($('#f_boxed').classList.contains('hidden')).toBe(true)
        expect($('#f_name').classList.contains('hidden')).toBe(true)
        expect(group('f_name').classList.contains('hidden')).toBe(false)
    })

    it('resolves one field per anchor element', () => {
        const definition = new FormDefinition()

        expect(definition.resolve('f_name')).toBe(definition.resolve($('#f_name')))
        expect(definition.resolve(block('f_name'))).toBe(definition.resolve('f_name'))
    })

    it('hands its field options to the fields it builds, blocks included', () => {
        const definition = new FormDefinition({ field: { behavior: bootstrapTheme({ hiddenClass: 'd-none' }) } })
        definition.when('f_vat').isChecked().show('f_date', block('f_boxed'))
        definition.apply()

        expect(group('f_date').classList.contains('d-none')).toBe(true)
        expect($('#f_boxed').classList.contains('d-none')).toBe(true)
    })

    it('follows values set by code', () => {
        const form = formView('f')
        new FormDefinition({ form }).when('vat').isChecked().show('date').apply()

        form.field('vat').setValue(true)

        expect(hidden('f_date')).toBe(false)
    })

    it('cascades through emptied fields', () => {
        const form = formView('f')
        const definition = new FormDefinition({ form })
        definition.when('vat').isFalsy().empty('name')
        definition.when('name').isTruthy().show('other')
        definition.apply()

        form.field('vat').setValue(true)
        type('f_name', 'x')
        expect(hidden('f_other')).toBe(false)

        form.field('vat').setValue(false)

        expect($('#f_name').value).toBe('')
        expect(hidden('f_other')).toBe(true)
    })

    it('cascades from the first evaluation', () => {
        $('#f_name').value = 'x'
        const definition = new FormDefinition({ form: formView('f') })
        definition.when('name').isTruthy().show('other')
        definition.when('vat').isFalsy().empty('name')

        definition.apply()

        expect($('#f_name').value).toBe('')
        expect(hidden('f_other')).toBe(true)
    })

    it('stops and reports rules that never settle', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        // A controller that "empties" by firing change without clearing anything
        bindField($('#f_name'), {
            getValue: () => 'stuck',
            setValue: () => $('#f_name').dispatchEvent(new Event('change')),
        })
        const definition = new FormDefinition({ form: formView('f') })
        definition.when('name').isTruthy().empty('name')

        definition.apply()

        expect(error).toHaveBeenCalledWith('Form rules did not settle after 10 passes.')
        error.mockRestore()
    })

    it('never requires a field it hides, and restores how it was rendered', () => {
        $('#f_date').required = true
        new FormDefinition().when('f_vat').isChecked().show('f_date').apply()

        expect($('#f_date').required).toBe(false)
        expect($('label').classList.contains('required')).toBe(false)

        check('f_vat')

        expect($('#f_date').required).toBe(true)
        expect($('label').classList.contains('required')).toBe(true)
    })

    it('lets a hide rule drop what a require rule asks', () => {
        const definition = new FormDefinition()
        definition.when('f_vat').isChecked().require('f_date')
        definition.when('f_name').equals('x').hide('f_date')
        definition.apply()

        check('f_vat')
        expect($('#f_date').required).toBe(true)

        type('f_name', 'x')
        expect($('#f_date').required).toBe(false)

        type('f_name', '')
        expect($('#f_date').required).toBe(true)
    })

    it('restores a rendered-required checkbox group once shown', () => {
        $('#f_tags').setAttribute('aria-required', 'true')
        new FormDefinition({ form: formView('f') }).when('vat').isChecked().show('tags').apply()

        expect($('#f_tags').hasAttribute('aria-required')).toBe(false)

        check('f_vat')

        expect($('#f_tags').getAttribute('aria-required')).toBe('true')
    })

    it('takes a Field as it is', () => {
        const date = new Field($('#f_date'))
        const definition = new FormDefinition()

        expect(definition.resolve(date)).toBe(date)
        expect(definition.resolve(block(date))).toBe(date)
    })

    it('resolves strings as paths of its form', () => {
        const form = formView('f')
        const definition = new FormDefinition({ form })
        definition.when('vat').isChecked().showAndRequire('date')
        definition.apply()

        check('f_vat')

        expect(hidden('f_date')).toBe(false)
        expect(definition.resolve('date')).toBe(form.field('date'))
    })

    it('names the rule behind a mistyped path or a missing target', () => {
        const definition = new FormDefinition({ form: formView('f') })
        definition.when('vat').isChecked().show('datee')

        expect(() => definition.apply()).toThrow(
            'Cannot resolve the "show" target of rule #1: No field "datee" in "f". Did you mean this: "date"?'
        )

        const undefinedSource = new FormDefinition()
        undefinedSource
            .when(undefined as unknown as string)
            .isChecked()
            .show('f_date')

        expect(() => undefinedSource.apply()).toThrow(
            'Cannot resolve the source of rule #1: No form field given (a mistyped path or property?).'
        )
    })

    it('throws a FormRuleError naming the rule, its role and the cause', () => {
        const definition = new FormDefinition({ form: formView('f') })
        definition.when('vat').isChecked().show('date')
        definition.when('vat').isChecked().require('datee')
        let error: unknown
        try {
            definition.apply()
        } catch (caught) {
            error = caught
        }

        expect(error).toBeInstanceOf(FormRuleError)
        expect(error).toMatchObject({ name: 'FormRuleError', rule: 2, role: 'require' })
        expect((error as FormRuleError).cause).toBeInstanceOf(FieldNotFoundError)
        expect((error as FormRuleError).cause).toMatchObject({ path: 'datee', suggestions: ['date'] })
    })

    it('lists its rules and accepts rules declared directly', () => {
        const definition = new FormDefinition()
        definition.when('f_vat').isChecked().show('f_date', 'f_other')
        definition.addRule({
            field: 'f_vat',
            extractor: null,
            test: (value) => value === true,
            effect: 'require',
            target: 'f_name',
        })

        expect(definition.rules.map((rule) => [rule.effect, rule.target])).toEqual([
            ['show', 'f_date'],
            ['show', 'f_other'],
            ['require', 'f_name'],
        ])

        definition.apply()
        check('f_vat')

        expect($('#f_name').required).toBe(true)
    })

    it('throws a FieldNotFoundError for an unknown id', () => {
        expect(() => new FormDefinition().resolve('missing')).toThrow(FieldNotFoundError)
    })

    it('refuses a block without an element', () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="f_ghost_0"></div>')
        const definition = new FormDefinition({ form: formView('f') })
        definition.when('vat').isChecked().show(block('ghost'))

        expect(() => definition.apply()).toThrow('The block "ghost" has no element.')
    })

    it('looks ids up inside its root only', () => {
        const definition = new FormDefinition({ root: $<HTMLElement>('#box') })

        expect(definition.resolve('f_boxed').inputs[0]).toBe($('#f_boxed'))
        expect(() => definition.resolve('f_name')).toThrow('Unable to find an element with id "f_name".')
    })

    it('rejects targets it cannot resolve', () => {
        const definition = new FormDefinition()

        expect(() => definition.resolve('')).toThrow('No form field given (a mistyped path or property?).')
        expect(() => definition.resolve('missing')).toThrow('Unable to find an element with id "missing".')
    })
})
