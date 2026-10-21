/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { getElementValue, radioGroup, setElementValue } from '../../src/form'
import { toValues } from '../../src/form/values'

const $ = <E extends Element>(selector: string): E => document.querySelector(selector) as E

beforeEach(() => {
    document.body.innerHTML = `
        <form>
            <input id="text" value="a">
            <textarea id="area">long text</textarea>
            <input id="check" type="checkbox" checked>
            <input id="r1" type="radio" name="r" value="1"><input id="r2" type="radio" name="r" value="2" checked>
            <input id="o1" type="radio" name="other" value="x">
            <select id="single"><option value="a"></option><option value="b" data-value="42" selected></option></select>
            <select id="empty"></select>
            <select id="multi" multiple>
                <option value="x" selected></option><option value="y" data-value="42"></option><option value="z" selected></option>
            </select>
        </form>
        <input id="loose" type="radio" name="loose" value="1"><input type="radio" name="loose" value="2" checked>`
})

describe('getElementValue', () => {
    it('reads text inputs and textareas as strings', () => {
        expect(getElementValue($('#text'))).toBe('a')
        expect(getElementValue($('#area'))).toBe('long text')
    })

    it('reads a checkbox as a boolean', () => {
        expect(getElementValue($('#check'))).toBe(true)
        $<HTMLInputElement>('#check').checked = false
        expect(getElementValue($('#check'))).toBe(false)
    })

    it("reads a radio as its group's checked value", () => {
        expect(getElementValue($('#r1'))).toBe('2')
        expect(getElementValue($('#r2'))).toBe('2')
        expect(getElementValue($('#o1'))).toBeUndefined()
    })

    it('finds the radio group outside a form', () => {
        expect(getElementValue($('#loose'))).toBe('2')
    })

    it('prefers data-value on select options', () => {
        expect(getElementValue($('#single'))).toBe('42')
        expect(getElementValue($('#multi'))).toEqual(['x', 'z'])
    })

    it('reads an empty select as null and an empty multiple select as []', () => {
        expect(getElementValue($('#empty'))).toBeNull()
        for (const option of $<HTMLSelectElement>('#multi').options) {
            option.selected = false
        }
        expect(getElementValue($('#multi'))).toEqual([])
    })
})

describe('toValues', () => {
    it('turns a value into the strings options are matched against', () => {
        expect(toValues(null)).toEqual([])
        expect(toValues(undefined)).toEqual([])
        expect(toValues('a')).toEqual(['a'])
        expect(toValues(42)).toEqual(['42'])
        expect(toValues(['a', 'b'])).toEqual(['a', 'b'])
    })
})

describe('radioGroup', () => {
    it('groups radios by name within their form, as the browser does', () => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<form><input id="other_r" type="radio" name="r" value="9"></form><input id="no_name" type="radio">'
        )

        expect(radioGroup($('#r1')).map((radio) => radio.id)).toEqual(['r1', 'r2'])
        expect(radioGroup($('#loose'))).toHaveLength(2)
        expect(radioGroup($('#other_r')).map((radio) => radio.id)).toEqual(['other_r'])
        expect(radioGroup($('#no_name'))).toEqual([$('#no_name')])
    })

    it('groups radios outside any form within a scope', () => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<div id="scope"><input id="scoped" type="radio" name="loose" value="3"></div>'
        )

        expect(radioGroup($('#loose'))).toHaveLength(3)
        expect(radioGroup($('#scoped'), $('#scope'))).toEqual([$('#scoped')])
    })
})

describe('setElementValue', () => {
    it('writes text, stringifying numbers and emptying null', () => {
        setElementValue($('#text'), 12)
        expect($<HTMLInputElement>('#text').value).toBe('12')

        setElementValue($('#area'), null)
        expect($<HTMLTextAreaElement>('#area').value).toBe('')
    })

    it('checks checkboxes and radios from a truthy value', () => {
        setElementValue($('#check'), false)
        setElementValue($('#r1'), 'yes')

        expect($<HTMLInputElement>('#check').checked).toBe(false)
        expect($<HTMLInputElement>('#r1').checked).toBe(true)
    })

    it('selects options by value or data-value', () => {
        setElementValue($('#single'), 'a')
        expect(getElementValue($('#single'))).toBe('a')

        setElementValue($('#single'), 42)
        expect(getElementValue($('#single'))).toBe('42')
    })

    it('selects nothing for null, and a placeholder for an empty string', () => {
        $('#single').insertAdjacentHTML('afterbegin', '<option value=""></option>')

        setElementValue($('#multi'), null)
        setElementValue($('#single'), '')

        expect(getElementValue($('#multi'))).toEqual([])
        expect(getElementValue($('#single'))).toBe('')
    })

    it('selects several options of a multiple select', () => {
        setElementValue($('#multi'), ['42', 'z'])

        expect(getElementValue($('#multi'))).toEqual(['42', 'z'])
    })
})
