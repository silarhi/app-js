/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendHTML, byId, domReady, escapeHtml, findAll, findAllSelf, findOne, on, trigger } from '../src'

beforeEach(() => {
    document.body.innerHTML = '<div id="root" class="match"><p class="match"></p><p></p></div><p class="match"></p>'
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('domReady', () => {
    it('resolves right away once the document is parsed', async () => {
        await expect(domReady()).resolves.toBeUndefined()
    })

    it('waits for DOMContentLoaded while the document is loading', async () => {
        vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
        let ready = false
        const pending = domReady().then(() => {
            ready = true
        })

        await Promise.resolve()
        expect(ready).toBe(false)

        document.dispatchEvent(new Event('DOMContentLoaded'))
        await pending
        expect(ready).toBe(true)
    })
})

describe('byId', () => {
    it('finds by id in the document or within a scope', () => {
        const root = document.getElementById('root') as HTMLElement
        const fragment = document.createElement('template')
        fragment.innerHTML = '<p id="detached"></p>'

        expect(byId('root')).toBe(root)
        expect(byId('root', root)).toBeNull()
        expect(byId('detached')).toBeNull()
        expect(byId('detached', fragment.content)?.tagName).toBe('P')
    })
})

describe('findOne / findAll', () => {
    it('query the document by default', () => {
        expect(findOne('.match')?.id).toBe('root')
        expect(findAll('.match')).toHaveLength(3)
    })

    it('scope to a root and return a real array', () => {
        const root = document.getElementById('root') as HTMLElement
        const found = findAll('p', root)

        expect(Array.isArray(found)).toBe(true)
        expect(found).toHaveLength(2)
        expect(findOne('#root', root)).toBeNull()
    })
})

describe('findAllSelf', () => {
    it('includes the root itself when it matches', () => {
        const root = document.getElementById('root') as HTMLElement

        expect(findAllSelf('.match', root)).toEqual([root, root.firstElementChild])
    })

    it('only searches descendants of a document or a non-matching root', () => {
        expect(findAllSelf('.match', document)).toHaveLength(3)
        expect(findAllSelf('p', document.getElementById('root') as HTMLElement)).toHaveLength(2)
    })
})

describe('on', () => {
    it('returns the listener removal', () => {
        const handler = vi.fn()
        const button = document.createElement('button')
        const off = on(button, 'click', handler)

        button.click()
        off()
        button.click()

        expect(handler).toHaveBeenCalledOnce()
    })

    it('forwards listener options', () => {
        const handler = vi.fn()
        const button = document.createElement('button')
        on(button, 'click', handler, { once: true })

        button.click()
        button.click()

        expect(handler).toHaveBeenCalledOnce()
    })
})

describe('trigger', () => {
    it('dispatches a bubbling, cancelable CustomEvent and returns it', () => {
        const root = document.getElementById('root') as HTMLElement
        const seen = vi.fn((event: Event) => event.preventDefault())
        document.body.addEventListener('custom', seen)

        const event = trigger(root.firstElementChild as Element, 'custom', { id: 1 })

        expect(seen).toHaveBeenCalledOnce()
        expect(event.detail).toEqual({ id: 1 })
        expect(event.defaultPrevented).toBe(true)
    })
})

describe('escapeHtml', () => {
    it('escapes every HTML-significant character', () => {
        expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
            '&lt;a href=&quot;x&quot; title=&#039;y&#039;&gt;&amp;&lt;/a&gt;'
        )
    })

    it('stringifies values and empties null and undefined', () => {
        expect(escapeHtml(42)).toBe('42')
        expect(escapeHtml(null)).toBe('')
        expect(escapeHtml(undefined)).toBe('')
    })
})

describe('appendHTML', () => {
    it('appends every node and returns the elements', () => {
        const root = document.getElementById('root') as HTMLElement

        const elements = appendHTML(root, 'text<span>a</span><b>b</b>')

        expect(elements.map((element) => element.tagName)).toEqual(['SPAN', 'B'])
        expect(root.lastChild).toBe(elements[1])
        expect(root.textContent).toBe('textab')
    })

    it('keeps elements a div would drop, like table rows', () => {
        document.body.innerHTML = '<table><tbody></tbody></table>'
        const tbody = document.querySelector('tbody') as HTMLTableSectionElement

        const [row] = appendHTML(tbody, '<tr><td>cell</td></tr>')

        expect(row.tagName).toBe('TR')
        expect(tbody.rows).toHaveLength(1)
    })
})
