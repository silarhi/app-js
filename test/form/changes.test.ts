/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { hasChanged, hasFieldChanged, hasUnsavedChanges, markFormChanged } from '../../src/form'

const $ = <E extends Element = HTMLInputElement>(selector: string): E => document.querySelector(selector) as E

beforeEach(() => {
    document.body.innerHTML = `
        <form id="tracked" data-track-changes="">
            <input id="text" value="saved">
            <textarea id="area">saved</textarea>
            <input id="check" type="checkbox" checked>
            <input id="r1" type="radio" name="r" value="1"><input id="r2" type="radio" name="r" value="2" checked>
            <input id="file" type="file">
            <select id="single"><option value="a"></option><option value="b" selected></option></select>
            <select id="placeholder"><option value=""></option><option value="a"></option></select>
            <select id="multi" multiple><option value="x" selected></option><option value="y"></option></select>
            <select id="preferred"><option value="1" selected></option><option disabled></option><option value="1"></option></select>
            <fieldset id="item"><input id="nested" value="saved"></fieldset>
        </form>
        <input id="outside" value="saved" form="tracked">
        <form id="untracked"><input id="free" value="saved"></form>`
})

describe('hasFieldChanged', () => {
    it('sees nothing on a field as rendered', () => {
        for (const field of document.querySelectorAll('input, textarea, select')) {
            expect(hasFieldChanged(field)).toBe(false)
        }
    })

    it('compares text with its rendered value', () => {
        $('#text').value = 'typed'
        expect(hasFieldChanged($('#text'))).toBe(true)

        $('#text').value = 'saved'
        expect(hasFieldChanged($('#text'))).toBe(false)

        $<HTMLTextAreaElement>('#area').value = 'typed'
        expect(hasFieldChanged($('#area'))).toBe(true)
    })

    it('compares checkboxes and radios with their rendered state', () => {
        $('#check').checked = false
        $('#r1').checked = true

        expect(hasFieldChanged($('#check'))).toBe(true)
        expect(hasFieldChanged($('#r1'))).toBe(true)
        expect(hasFieldChanged($('#r2'))).toBe(true)
    })

    it('compares selects by the values of their rendered options', () => {
        $<HTMLSelectElement>('#single').value = 'a'
        $<HTMLSelectElement>('#placeholder').value = 'a'
        $<HTMLSelectElement>('#multi').options[1].selected = true

        expect(hasFieldChanged($('#single'))).toBe(true)
        expect(hasFieldChanged($('#placeholder'))).toBe(true)
        expect(hasFieldChanged($('#multi'))).toBe(true)
    })

    it('sees no change in the other copy of a preferred choice', () => {
        $<HTMLSelectElement>('#preferred').selectedIndex = 2

        expect(hasFieldChanged($('#preferred'))).toBe(false)
    })

    it('takes a starting value declared by a widget', () => {
        $('#text').value = 'normalized'
        $('#text').defaultValue = 'normalized'

        expect(hasFieldChanged($('#text'))).toBe(false)
    })

    it('ignores what holds no value', () => {
        expect(hasFieldChanged($('#item'))).toBe(false)
    })
})

describe('hasChanged', () => {
    it('reads a form through its controls, the ones outside it included', () => {
        expect(hasChanged($('#tracked'))).toBe(false)

        $('#outside').value = 'typed'

        expect(hasChanged($('#tracked'))).toBe(true)
    })

    it('reads the controls inside any other element', () => {
        $('#text').value = 'typed'
        expect(hasChanged($('#item'))).toBe(false)

        $('#nested').value = 'typed'
        expect(hasChanged($('#item'))).toBe(true)
    })

    it('takes a form refused by the server as changed', () => {
        $<HTMLFormElement>('#tracked').dataset.trackChanges = 'refused'

        expect(hasChanged($('#tracked'))).toBe(true)
    })
})

describe('hasUnsavedChanges', () => {
    it('only reads the tracked forms', () => {
        $('#free').value = 'typed'
        expect(hasUnsavedChanges()).toBe(false)

        $('#text').value = 'typed'
        expect(hasUnsavedChanges()).toBe(true)
        expect(hasUnsavedChanges($('#untracked'))).toBe(false)
    })

    it('counts a form marked changed', () => {
        markFormChanged($('#nested'))
        markFormChanged($('#free'))

        expect($<HTMLFormElement>('#tracked').dataset.trackChanges).toBe('changed')
        expect($<HTMLFormElement>('#untracked').dataset.trackChanges).toBeUndefined()
        expect(hasUnsavedChanges()).toBe(true)
    })
})
