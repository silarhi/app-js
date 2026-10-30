/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App, escapeHtml, type Listener } from '../../src'
import {
    COLLECTION_EVENTS,
    CollectionManager,
    type CollectionOptions,
    collectionListener,
    DEFAULT_BUTTON_SELECTORS,
    DEFAULT_SELECTORS,
    formView,
} from '../../src/form'

declare module '../../src/Container' {
    interface ServiceMap {
        collections: CollectionManager
    }
}

const $ = <E extends Element = HTMLElement>(selector: string): E => document.querySelector(selector) as unknown as E

const input = <E extends Element = HTMLInputElement>(item: Element, selector = 'input'): E =>
    item.querySelector(selector) as unknown as E

/** A manager on an app of its own, which mounts nothing */
const manager = (options: Partial<CollectionOptions> = {}): CollectionManager =>
    new CollectionManager({ app: new App(), ...options })

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
            order.push(`add ${event.detail.index}`)
        })
        $('#tasks').addEventListener(COLLECTION_EVENTS.added, () => order.push('added'))

        const item = collections.add('tasks')

        expect(order).toEqual(['add 1', 'mount tasks_1_label', 'added'])
        expect(item).toBe($('#tasks').lastElementChild)
        expect(item.dataset.collectionIndex).toBe('1')
        expect($('#tasks').dataset.index).toBe('2')
    })

    it('adds to the collection in the wrapper of a button', () => {
        const item = manager().addFrom($('.add-collection'), { label: 'Next' })

        expect(item.parentElement).toBe($('#tasks'))
        expect(input(item).value).toBe('Next')
    })

    it('throws for a button outside any wrapper', () => {
        document.body.insertAdjacentHTML('beforeend', '<button id="lost"></button>')

        expect(() => manager().addFrom($('#lost'))).toThrow(
            'No ".form-collection" found in the ".collection-wrapper" of the button.'
        )
    })

    it('throws without a prototype or for an unknown id', () => {
        delete $('#tasks').dataset.prototype
        const collections = manager()

        expect(() => collections.add('tasks')).toThrow('The collection has no "data-prototype" attribute.')
        expect(() => collections.add('missing')).toThrow('Unable to find an element with id "missing".')
    })

    it('honours a custom prototype name', () => {
        $('#tasks').dataset.prototype = ITEM('__task__')
        $('#tasks').dataset.prototypeName = '__task__'

        expect(input(manager().add('tasks')).id).toBe('tasks_1_label')
    })
})

describe('next index', () => {
    it('never reuses an index after a removal', async () => {
        const collections = manager()

        collections.add('tasks')
        await collections.remove(collections.items('tasks')[1], { confirm: false })

        expect(input(collections.add('tasks')).id).toBe('tasks_2_label')
    })

    it('continues after the highest Symfony index when keys have gaps', () => {
        $('#tasks').insertAdjacentHTML('beforeend', ITEM('4'))
        $('#tasks').insertAdjacentHTML('beforeend', '<input id="tasks_note" name="tasks[note]">')

        expect(input(manager().add('tasks')).id).toBe('tasks_5_label')
    })

    it('starts at 0 for an empty collection', () => {
        $('#tasks').replaceChildren()

        expect(input(manager().add('tasks')).id).toBe('tasks_0_label')
    })

    it('prefers a data-index rendered by the template', () => {
        $('#tasks').dataset.index = '9'

        expect(input(manager().add('tasks')).id).toBe('tasks_9_label')
    })

    it('counts children for a collection without an id', () => {
        const collection = $('#tasks')
        collection.removeAttribute('id')

        expect(input(manager().add(collection)).id).toBe('tasks_1_label')
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
        const item = manager().add('tasks', {
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

        manager().add('tasks', { steps: [{ name: 'build' }] })
        document.removeEventListener(COLLECTION_EVENTS.add, added)

        expect(added).toHaveBeenCalledOnce()
    })

    it('notifies change on the fields it fills', () => {
        const changed = vi.fn((event: Event) => (event.target as HTMLElement).id)
        document.addEventListener('change', changed)

        manager().add('tasks', { label: 'Ship', owner: { id: 5 } })
        manager().add('tasks')
        document.removeEventListener('change', changed)

        expect(changed.mock.results.map((result) => result.value)).toEqual(['tasks_1_label', 'tasks_1_owner'])
    })

    it('empties a field given null', () => {
        const item = manager().add('tasks', { label: null })

        expect(input(item).value).toBe('')
    })

    it('leaves fields without a value untouched', () => {
        const item = manager().add('tasks', { label: undefined, unknown: 'x', address: {} })

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
        $('#tasks').addEventListener(COLLECTION_EVENTS.removed, (event) => removed(event.detail))
        const collections = new CollectionManager({ app })
        const item = collections.items('tasks')[0]

        expect(await collections.remove(input(item, 'button'))).toBe(true)

        expect(item.isConnected).toBe(false)
        expect(disconnected).toEqual(['tasks_0_label'])
        expect(removed).toHaveBeenCalledWith({ collection: $('#tasks'), item, index: 0 })
    })

    it('lets a collection.remove handler veto the removal before any dialog', async () => {
        const confirm = vi.fn(() => true)
        const collections = manager({ confirm })
        $('#tasks').addEventListener(COLLECTION_EVENTS.remove, (event) => event.preventDefault())

        expect(await collections.remove(collections.add('tasks'))).toBe(false)
        expect(collections.items('tasks')).toHaveLength(2)
        expect(confirm).not.toHaveBeenCalled()
    })

    it('asks through window.confirm by default, only for buttons with a message', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
        const collections = manager()
        const added = collections.add('tasks')

        expect(await collections.remove(input(added, 'button'))).toBe(false)
        expect(confirm).toHaveBeenCalledWith('Sure?')

        expect(await collections.remove($('.remove-collection'))).toBe(true)
        expect(confirm).toHaveBeenCalledOnce()
    })

    it('asks through the confirm option when given', async () => {
        const confirm = vi.fn(async () => true)
        const collections = manager({ confirm })
        const added = collections.add('tasks')

        expect(await collections.remove(input(added, 'button'))).toBe(true)
        expect(confirm).toHaveBeenCalledWith('Sure?', expect.objectContaining({ item: added, index: 1 }))
    })

    it('skips the dialog with confirm: false', async () => {
        const confirm = vi.fn(() => false)
        const collections = manager({ confirm })
        const added = collections.add('tasks')

        expect(await collections.remove(input(added, 'button'), { confirm: false })).toBe(true)
        expect(confirm).not.toHaveBeenCalled()
    })

    it('removes the ancestor named by data-item', async () => {
        $('#tasks').insertAdjacentHTML(
            'beforeend',
            '<section class="card"><input id="tasks_1_label" name="tasks[1][label]"><button data-item=".card"></button></section>'
        )

        expect(await manager().remove($('.card button'))).toBe(true)
        expect($('.card')).toBeNull()
    })

    it('ignores a target outside any item or collection', async () => {
        const collections = manager()
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
        expect(manager().items('tasks')).toHaveLength(1)
        expect(manager().items('tasks_0_steps')).toHaveLength(1)
    })

    it('clears every item without asking', async () => {
        const confirm = vi.fn(() => false)
        const collections = manager({ confirm })
        collections.add('tasks')

        await collections.clear('tasks')

        expect(collections.items('tasks')).toEqual([])
        expect(confirm).not.toHaveBeenCalled()
    })

    it('runs for existing and added items until stopped, with each item as a FormView', () => {
        const collections = manager()
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
        const collections = manager()
        const tasks = formView('tasks')

        collections.add(tasks, { label: 'From a view' })

        expect(collections.items(tasks)).toHaveLength(2)
        expect(tasks.field('1.label').value).toBe('From a view')
        expect(() => collections.add(formView('missing'))).toThrow('The collection "missing" is not rendered.')
    })

    it('keeps the ids of server-rendered items with gaps', () => {
        $('#tasks').insertAdjacentHTML('beforeend', ITEM('4'))
        const indexes: number[] = []

        manager().each('tasks', ({ index }) => indexes.push(index))

        expect(indexes).toEqual([0, 4])
    })

    it('ignores items added to a nested collection', () => {
        const collections = manager()
        const handler = vi.fn()
        collections.each('tasks', handler)
        handler.mockClear()

        collections.add('tasks_0_steps')

        expect(handler).not.toHaveBeenCalled()
    })
})

describe('collectionListener', () => {
    /** An app with the manager as the "collections" service, its buttons' listener and `listeners`, mounted */
    const appWith = (options: Partial<CollectionOptions> = {}, listeners: Listener[] = []) => {
        const factory = vi.fn(
            (container): CollectionManager => new CollectionManager({ app: container.get('app'), ...options })
        )
        const app = new App({
            services: { collections: factory },
            listeners: [collectionListener('collections'), ...listeners],
        })
        app.mount(document)

        return { app, factory, collections: (): CollectionManager => app.get('collections') }
    }

    it('adds an item from the add button, mounted by the app', () => {
        const mounted = vi.fn()
        const { app, collections } = appWith({}, [{ selector: '.form-control', connect: mounted }])
        mounted.mockClear()

        $('.add-collection').click()

        expect(collections().items('tasks')).toHaveLength(2)
        expect(mounted).toHaveBeenCalledWith($('#tasks_1_label'), { app })
    })

    it('builds the manager on the first click only', () => {
        const { factory } = appWith()
        expect(factory).not.toHaveBeenCalled()

        $('.add-collection').click()
        $('.add-collection').click()

        expect(factory).toHaveBeenCalledOnce()
    })

    it('removes an item from its remove button without bubbling the click', async () => {
        const { collections } = appWith()
        const outside = vi.fn()
        document.body.addEventListener('click', outside)

        $('.remove-collection').click()
        await Promise.resolve()

        expect(collections().items('tasks')).toEqual([])
        expect(outside).not.toHaveBeenCalled()
    })

    it('connects buttons added with an item', () => {
        const { collections } = appWith()
        $('.add-collection').click()

        const added = collections().items('tasks')[1]
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        input(added, 'button').click()

        return vi.waitFor(() => expect(added.isConnected).toBe(false))
    })

    it('logs an add button with no collection next to it', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        document.body.insertAdjacentHTML('beforeend', '<button class="add-collection" id="lost"></button>')
        appWith()

        $('#lost').click()

        expect(error).toHaveBeenCalledWith('Failed to add collection item', expect.any(Error))
    })

    it('logs a failed removal', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { collections } = appWith({
            confirm: () => {
                throw new Error('dialog failed')
            },
        })
        $('.add-collection').click()

        input(collections().items('tasks')[1], 'button').click()

        await vi.waitFor(() =>
            expect(error).toHaveBeenCalledWith('Failed to remove collection item', expect.any(Error))
        )
    })

    it('stops listening once unmounted', () => {
        const { app, collections } = appWith()
        app.unmount(document)

        $('.add-collection').click()

        expect(collections().items('tasks')).toHaveLength(1)
    })

    it('follows custom selectors, the buttons on the listener and the markup on the manager', () => {
        document.body.innerHTML = `
            <fieldset class="rows-wrapper">
                <div id="rows" class="rows" data-prototype='<p class="row"><input id="rows___name___v"></p>'></div>
                <a class="row-add"></a>
            </fieldset>`
        const listener = collectionListener('collections', { add: '.row-add', remove: '.row-remove' })
        const collections = manager({ selectors: { collection: '.rows', item: '.row', wrapper: '.rows-wrapper' } })
        new App({ services: { collections: () => collections }, listeners: [listener] }).mount(document)

        $('.row-add').click()

        expect(listener.selector).toBe('.row-add, .row-remove')
        expect(collections.items('rows')).toHaveLength(1)
        expect(collections.selectors).toEqual({ collection: '.rows', item: '.row', wrapper: '.rows-wrapper' })
        expect(DEFAULT_BUTTON_SELECTORS).toEqual({ add: '.add-collection', remove: '.remove-collection' })
        expect(DEFAULT_SELECTORS).toEqual({
            collection: '.form-collection',
            item: '.collection-item',
            wrapper: '.collection-wrapper',
        })
    })

    it('only takes the id of a CollectionManager service', () => {
        // @ts-expect-error "app" is the App, not a CollectionManager
        expect(collectionListener('app').selector).toBe('.add-collection, .remove-collection')
    })
})
