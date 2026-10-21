/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App, escapeHtml } from '../../src'
import {
    COLLECTION_EVENTS,
    type CollectionItemDetail,
    CollectionManager,
    DEFAULT_SELECTORS,
    formView,
} from '../../src/form'

const $ = <E extends Element = HTMLElement>(selector: string): E => document.querySelector(selector) as unknown as E

const input = <E extends Element = HTMLInputElement>(item: Element, selector = 'input'): E =>
    item.querySelector(selector) as unknown as E

const ITEM = (name: string): string =>
    `<div class="collection-item"><input id="tasks_${name}_label" name="tasks[${name}][label]" class="form-control"><button class="remove-collection" data-confirm-message="Sure?"></button></div>`

beforeEach(() => {
    document.body.innerHTML = `
        <div class="collection-wrapper">
            <div id="tasks" class="form-collection" data-prototype='${ITEM('__name__')}'>
                <div class="collection-item"><input id="tasks_0_label" name="tasks[0][label]" class="form-control"><button class="remove-collection"></button></div>
            </div>
            <button class="add-collection"></button>
        </div>`
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('add', () => {
    it('renders the prototype, then reports and mounts the item', () => {
        const order: string[] = []
        const app = new App({
            listeners: [{ selector: '.form-control', connect: (field) => void order.push(`mount ${field.id}`) }],
        })
        const collections = new CollectionManager({ app })
        $('#tasks').addEventListener(COLLECTION_EVENTS.add, (event) => {
            order.push(`add ${(event as CustomEvent<CollectionItemDetail>).detail.index}`)
        })
        $('#tasks').addEventListener(COLLECTION_EVENTS.added, () => order.push('added'))

        const item = collections.add('tasks')

        expect(order).toEqual(['add 1', 'mount tasks_1_label', 'added'])
        expect(item).toBe($('#tasks').lastElementChild)
        expect(item.dataset.collectionIndex).toBe('1')
        expect($('#tasks').dataset.index).toBe('2')
    })

    it('works without an app, mounting nothing', () => {
        const item = new CollectionManager().add($('#tasks'))

        expect(input(item).id).toBe('tasks_1_label')
    })

    it('throws without a prototype or for an unknown id', () => {
        delete $('#tasks').dataset.prototype
        const collections = new CollectionManager()

        expect(() => collections.add('tasks')).toThrow('The collection has no "data-prototype" attribute.')
        expect(() => collections.add('missing')).toThrow('Unable to find an element with id "missing".')
    })

    it('honours a custom prototype name', () => {
        $('#tasks').dataset.prototype = ITEM('__task__')
        $('#tasks').dataset.prototypeName = '__task__'

        expect(input(new CollectionManager().add('tasks')).id).toBe('tasks_1_label')
    })
})

describe('next index', () => {
    it('never reuses an index after a removal', async () => {
        const collections = new CollectionManager()

        collections.add('tasks')
        await collections.remove(collections.items('tasks')[1], { confirm: false })

        expect(input(collections.add('tasks')).id).toBe('tasks_2_label')
    })

    it('continues after the highest Symfony index when keys have gaps', () => {
        $('#tasks').insertAdjacentHTML('beforeend', ITEM('4'))
        $('#tasks').insertAdjacentHTML('beforeend', '<input id="tasks_note" name="tasks[note]">')

        expect(input(new CollectionManager().add('tasks')).id).toBe('tasks_5_label')
    })

    it('starts at 0 for an empty collection', () => {
        $('#tasks').replaceChildren()

        expect(input(new CollectionManager().add('tasks')).id).toBe('tasks_0_label')
    })

    it('prefers a data-index rendered by the template', () => {
        $('#tasks').dataset.index = '9'

        expect(input(new CollectionManager().add('tasks')).id).toBe('tasks_9_label')
    })

    it('counts children for a collection without an id', () => {
        const collection = $('#tasks')
        collection.removeAttribute('id')

        expect(input(new CollectionManager().add(collection)).id).toBe('tasks_1_label')
    })
})

describe('add with values', () => {
    beforeEach(() => {
        const nested = escapeHtml(
            '<div class="collection-item"><input id="tasks___name___steps___step___name" name="tasks[__name__][steps][__step__][name]" class="form-control"></div>'
        )
        $('#tasks').dataset.prototype = `<div class="collection-item">
            <input id="tasks___name___label" name="tasks[__name__][label]" class="form-control">
            <select id="tasks___name___owner" name="tasks[__name__][owner]" class="form-select"><option value="1"></option><option value="5"></option></select>
            <select id="tasks___name___tags" name="tasks[__name__][tags][]" class="form-select" multiple><option value="a"></option><option value="b"></option></select>
            <input id="tasks___name___address_city" name="tasks[__name__][address][city]" class="form-control">
            <div id="tasks___name___steps" class="form-collection" data-prototype-name="__step__" data-prototype="${nested}"></div>
        </div>`
    })

    it('fills fields, entity ids, multiple selects, embedded forms and nested collections', () => {
        const item = new CollectionManager().add('tasks', {
            label: 'Ship',
            owner: { id: 5, name: 'Ada' },
            tags: ['a', 'b'],
            address: { city: 'Toulouse' },
            steps: [{ name: 'build' }, { name: 'deploy' }],
        })

        expect(input(item).value).toBe('Ship')
        expect(input<HTMLSelectElement>(item, '#tasks_1_owner').value).toBe('5')
        expect([...input<HTMLSelectElement>(item, '#tasks_1_tags').selectedOptions].map((o) => o.value)).toEqual([
            'a',
            'b',
        ])
        expect(input(item, '#tasks_1_address_city').value).toBe('Toulouse')
        expect(
            [...item.querySelectorAll<HTMLInputElement>('#tasks_1_steps input')].map((i) => [i.id, i.value])
        ).toEqual([
            ['tasks_1_steps_0_name', 'build'],
            ['tasks_1_steps_1_name', 'deploy'],
        ])
    })

    it('reports nested items through the outer item only', () => {
        const added = vi.fn()
        document.addEventListener(COLLECTION_EVENTS.add, added)

        new CollectionManager().add('tasks', { steps: [{ name: 'build' }] })
        document.removeEventListener(COLLECTION_EVENTS.add, added)

        expect(added).toHaveBeenCalledOnce()
    })

    it('notifies change on the fields it fills', () => {
        const changed = vi.fn((event: Event) => (event.target as HTMLElement).id)
        document.addEventListener('change', changed)

        new CollectionManager().add('tasks', { label: 'Ship', owner: { id: 5 } })
        new CollectionManager().add('tasks')
        document.removeEventListener('change', changed)

        expect(changed.mock.results.map((result) => result.value)).toEqual(['tasks_1_label', 'tasks_1_owner'])
    })

    it('empties a field given null', () => {
        const item = new CollectionManager().add('tasks', { label: null })

        expect(input(item).value).toBe('')
    })

    it('leaves fields without a value untouched', () => {
        const item = new CollectionManager().add('tasks', { label: undefined, unknown: 'x', address: {} })

        expect(input(item).value).toBe('')
        expect(input(item, '#tasks_1_address_city').value).toBe('')
    })
})

describe('remove', () => {
    it('unmounts, removes and reports the item', async () => {
        const disconnected: string[] = []
        const app = new App({
            listeners: [{ selector: '.form-control', connect: (field) => () => void disconnected.push(field.id) }],
        })
        app.mount(document)
        const removed = vi.fn()
        $('#tasks').addEventListener(COLLECTION_EVENTS.removed, (event) => removed((event as CustomEvent).detail))
        const collections = new CollectionManager({ app })
        const item = collections.items('tasks')[0]

        expect(await collections.remove(input(item, 'button'))).toBe(true)

        expect(item.isConnected).toBe(false)
        expect(disconnected).toEqual(['tasks_0_label'])
        expect(removed).toHaveBeenCalledWith({ collection: $('#tasks'), item, index: 0 })
    })

    it('lets a collection.remove handler veto the removal before any dialog', async () => {
        const confirm = vi.fn(() => true)
        const collections = new CollectionManager({ confirm })
        $('#tasks').addEventListener(COLLECTION_EVENTS.remove, (event) => event.preventDefault())

        expect(await collections.remove(collections.add('tasks'))).toBe(false)
        expect(collections.items('tasks')).toHaveLength(2)
        expect(confirm).not.toHaveBeenCalled()
    })

    it('asks through window.confirm by default, only for buttons with a message', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
        const collections = new CollectionManager()
        const added = collections.add('tasks')

        expect(await collections.remove(input(added, 'button'))).toBe(false)
        expect(confirm).toHaveBeenCalledWith('Sure?')

        expect(await collections.remove($('.remove-collection'))).toBe(true)
        expect(confirm).toHaveBeenCalledOnce()
    })

    it('asks through the confirm option when given', async () => {
        const confirm = vi.fn(async () => true)
        const collections = new CollectionManager({ confirm })
        const added = collections.add('tasks')

        expect(await collections.remove(input(added, 'button'))).toBe(true)
        expect(confirm).toHaveBeenCalledWith('Sure?', expect.objectContaining({ item: added, index: 1 }))
    })

    it('skips the dialog with confirm: false', async () => {
        const confirm = vi.fn(() => false)
        const collections = new CollectionManager({ confirm })
        const added = collections.add('tasks')

        expect(await collections.remove(input(added, 'button'), { confirm: false })).toBe(true)
        expect(confirm).not.toHaveBeenCalled()
    })

    it('removes the ancestor named by data-item', async () => {
        $('#tasks').insertAdjacentHTML(
            'beforeend',
            '<section class="card"><input id="tasks_1_label" name="tasks[1][label]"><button data-item=".card"></button></section>'
        )

        expect(await new CollectionManager().remove($('.card button'))).toBe(true)
        expect($('.card')).toBeNull()
    })

    it('ignores a target outside any item or collection', async () => {
        const collections = new CollectionManager()
        const stray = document.createElement('div')
        stray.className = 'collection-item'
        document.body.append(stray)

        expect(await collections.remove($('.add-collection'))).toBe(false)
        expect(await collections.remove(stray)).toBe(false)
    })
})

describe('items, clear and each', () => {
    beforeEach(() => {
        input($('#tasks .collection-item'), 'button').insertAdjacentHTML(
            'afterend',
            `<div id="tasks_0_steps" class="form-collection" data-prototype='<div class="collection-item"><input id="tasks_0_steps___name___name" name="tasks[0][steps][__name__][name]" class="form-control"></div>'>
                <div class="collection-item"><input id="tasks_0_steps_0_name" name="tasks[0][steps][0][name]" class="form-control"></div>
            </div>`
        )
    })

    it('lists direct items only', () => {
        expect(new CollectionManager().items('tasks')).toHaveLength(1)
        expect(new CollectionManager().items('tasks_0_steps')).toHaveLength(1)
    })

    it('clears every item without asking', async () => {
        const confirm = vi.fn(() => false)
        const collections = new CollectionManager({ confirm })
        collections.add('tasks')

        await collections.clear('tasks')

        expect(collections.items('tasks')).toEqual([])
        expect(confirm).not.toHaveBeenCalled()
    })

    it('runs for existing and added items until stopped, with each item as a FormView', () => {
        const collections = new CollectionManager()
        const seen: Array<[number, string, string[]]> = []
        const stop = collections.each('tasks', ({ index, form }) => {
            seen.push([index, form.get('label').id, form.children.map((child) => child.name)])
        })

        collections.add('tasks')
        stop()
        collections.add('tasks')

        expect(seen).toEqual([
            [0, 'tasks_0_label', ['label', 'steps']],
            [1, 'tasks_1_label', ['label']],
        ])
    })

    it('accepts a FormView as the collection', () => {
        const collections = new CollectionManager()
        const tasks = formView('tasks')

        collections.add(tasks, { label: 'From a view' })

        expect(collections.items(tasks)).toHaveLength(2)
        expect(tasks.field('1.label').value).toBe('From a view')
        expect(() => collections.add(formView('missing'))).toThrow('The collection "missing" is not rendered.')
    })

    it('keeps the ids of server-rendered items with gaps', () => {
        $('#tasks').insertAdjacentHTML('beforeend', ITEM('4'))
        const indexes: number[] = []

        new CollectionManager().each('tasks', ({ index }) => indexes.push(index))

        expect(indexes).toEqual([0, 4])
    })

    it('ignores items added to a nested collection', () => {
        const collections = new CollectionManager()
        const handler = vi.fn()
        collections.each('tasks', handler)
        handler.mockClear()

        collections.add('tasks_0_steps')

        expect(handler).not.toHaveBeenCalled()
    })
})

describe('listener', () => {
    it('adds an item from the add button, mounted by the adopted app', () => {
        const mounted = vi.fn()
        const collections = new CollectionManager()
        const app = new App({ listeners: [collections.listener, { selector: '.form-control', connect: mounted }] })
        app.mount(document)
        mounted.mockClear()

        $('.add-collection').click()

        expect(collections.items('tasks')).toHaveLength(2)
        expect(mounted).toHaveBeenCalledWith($('#tasks_1_label'), { app })
    })

    it('removes an item from its remove button without bubbling the click', async () => {
        const collections = new CollectionManager()
        new App({ listeners: [collections.listener] }).mount(document)
        const outside = vi.fn()
        document.body.addEventListener('click', outside)

        $('.remove-collection').click()
        await Promise.resolve()

        expect(collections.items('tasks')).toEqual([])
        expect(outside).not.toHaveBeenCalled()
    })

    it('connects buttons added with an item', () => {
        const collections = new CollectionManager()
        new App({ listeners: [collections.listener] }).mount(document)
        $('.add-collection').click()

        const added = collections.items('tasks')[1]
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        input(added, 'button').click()

        return vi.waitFor(() => expect(added.isConnected).toBe(false))
    })

    it('logs an add button with no collection next to it', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.insertAdjacentHTML('beforeend', '<button class="add-collection" id="lost"></button>')
        const collections = new CollectionManager()
        new App({ listeners: [collections.listener] }).mount(document)

        $('#lost').click()

        expect(error).toHaveBeenCalledWith('No ".form-collection" found next to', $('#lost'))
    })

    it('logs a failed removal', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const collections = new CollectionManager({
            confirm: () => {
                throw new Error('dialog failed')
            },
        })
        new App({ listeners: [collections.listener] }).mount(document)
        $('.add-collection').click()

        input(collections.items('tasks')[1], 'button').click()

        await vi.waitFor(() =>
            expect(error).toHaveBeenCalledWith('Failed to remove collection item', expect.any(Error))
        )
    })

    it('stops listening once unmounted', () => {
        const collections = new CollectionManager()
        const app = new App({ listeners: [collections.listener] })
        app.mount(document)
        app.unmount(document)

        $('.add-collection').click()

        expect(collections.items('tasks')).toHaveLength(1)
    })

    it('follows custom selectors', () => {
        document.body.innerHTML = `
            <fieldset class="rows-wrapper">
                <div id="rows" class="rows" data-prototype='<p class="row"><input id="rows___name___v"></p>'></div>
                <a class="row-add"></a>
            </fieldset>`
        const collections = new CollectionManager({
            selectors: {
                collection: '.rows',
                item: '.row',
                wrapper: '.rows-wrapper',
                add: '.row-add',
                remove: '.row-remove',
            },
        })
        new App({ listeners: [collections.listener] }).mount(document)

        $('.row-add').click()

        expect(collections.listener.selector).toBe('.row-add, .row-remove')
        expect(collections.items('rows')).toHaveLength(1)
        expect(collections.selectors).toEqual({
            ...DEFAULT_SELECTORS,
            collection: '.rows',
            item: '.row',
            wrapper: '.rows-wrapper',
            add: '.row-add',
            remove: '.row-remove',
        })
    })
})
