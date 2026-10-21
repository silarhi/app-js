/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { describe, expect, it } from 'vitest'
import { HIDDEN_CLASS, hide, show, toggle } from '../src'

describe('visibility helpers', () => {
    it('toggle the hidden class', () => {
        const element = document.createElement('div')

        hide(element)
        expect(element.classList.contains(HIDDEN_CLASS)).toBe(true)

        show(element)
        expect(element.classList.contains(HIDDEN_CLASS)).toBe(false)

        toggle(element, false)
        expect(element.className).toBe('hidden')
        toggle(element, true)
        expect(element.className).toBe('')
    })

    it('accept another class, like Bootstrap d-none', () => {
        const element = document.createElement('div')

        hide(element, 'd-none')
        expect(element.className).toBe('d-none')

        toggle(element, true, 'd-none')
        expect(element.className).toBe('')

        toggle(element, false, 'd-none')
        show(element, 'd-none')
        expect(element.className).toBe('')
    })
})
