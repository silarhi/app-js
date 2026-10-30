# @silarhi/app-js

Tiny, framework-agnostic orchestrator for server-rendered apps. No runtime dependency: no jQuery, no Bootstrap, no
Turbo required.

- **Modules** — boot-once hooks (`document` / `window` / library globals), run by `app.start()`
- **Listeners** — `{ selector, connect(element, { app }) }`, connected once per element on every `app.mount(container)`;
  the optional returned cleanup runs on `app.unmount(container)`
- **Pages** — lazy initializers declared in markup (`data-page`), each shipped in its own chunk
- **Services** — a lazy container with typed ids and Symfony's services / parameters split
- **Forms** (`@silarhi/app-js/form`) — Symfony form collections, dependent-field rules, value helpers
- **HTTP** (`@silarhi/app-js/http`) — `fetch()` helpers that speak Symfony's AJAX conventions
- **Testing** (`@silarhi/app-js/testing`) — fixtures and listener harnesses for an app's own tests

```bash
pnpm add @silarhi/app-js
```

## Usage

```js
import { App } from '@silarhi/app-js'
import confirm from './modules/confirm'
import tooltip from './listeners/tooltip'
import datepicker from './listeners/datepicker'

const app = new App({
    modules: [confirm],
    listeners: [tooltip, datepicker],
    pages: {
        'user-form': () => import('./pages/user-form'),
    },
})

app.start()
app.mount(document)
```

The core ships no listener or module of its own, only the built-in `data-page` one.
More can be registered at any time with `app.addModule()`, `app.addListener()`, `app.addPages()` or
`app.registerPage()`, so a shared package can export its own listeners for apps to spread in.

### Modules

```js
// modules/confirm.js
import { defineModule, on } from '@silarhi/app-js'

export default defineModule(() => {
    on(document, 'click', (event) => {
        const trigger = event.target.closest('[data-confirm]')
        if (trigger && !window.confirm(trigger.dataset.confirm)) {
            event.preventDefault()
        }
    })
})
```

A module runs once, on `app.start()`, in registration order; one added later with `app.addModule()` runs right away.
It binds to `document`, `window` or library globals only, never to elements a partial render may replace: those belong
in a listener. Its return value is ignored, as a module lives as long as the page. It may be async: `start()` does not
wait for it, and a rejection is reported like a synchronous throw.

### Listeners

```js
import { defineListener, on } from '@silarhi/app-js'

export default defineListener({
    selector: '[data-autosubmit]',
    connect: (select) => on(select, 'change', () => select.form?.requestSubmit()),
})
```

Listeners connect in registration order. `mount()` skips elements already connected, so overlapping mounts are safe;
`unmount()` disconnects the container, its descendants and any element that already left the document.

`connect` may be async. A cleanup that resolves after the element was disconnected runs right away, and a rejection is
reported like a synchronous throw. `app.whenConnected(root)` settles once the async connects started within `root` have
settled (`undefined` when none is pending), e.g. `app.mount(frame); await app.whenConnected(frame)`.

#### Lazy listeners

Keep the heavy imports at the top of the listener file and default-export `defineLazyListener({ connect })`, with no
selector: `lazyListener()` holds it in the entry, and the chunk is imported on the first matching element only.

```js
// listeners/datepicker.js
import flatpickr from 'flatpickr'
import { defineLazyListener } from '@silarhi/app-js'

export default defineLazyListener({
    connect(input) {
        const picker = flatpickr(input)
        return () => picker.destroy()
    },
})
```

```js
// app.js
import { App, lazyListener } from '@silarhi/app-js'

const app = new App({
    listeners: [lazyListener('[data-datepicker]', () => import('./listeners/datepicker'))],
})
```

The chunk is imported once (concurrent connects share it, a failed import is retried on the next connect). A full
`defineListener()` export works too, so one file can be registered eagerly or lazily; its own selector is then ignored.

### Pages

```html
<div data-page='["user-form"]' data-page-params='{"userId": 42}'></div>
<div data-page="dashboard"></div>
```

```js
// pages/user-form.js
import { definePage } from '@silarhi/app-js'

export default definePage(({ app, container, userId }) => {
    // …
    return () => {
        /* cleanup */
    }
})
```

The `data-page` listener always connects after the consumer's listeners and waits for their async connects within its
element (lazy listeners included), so page code can rely on them. Listeners outside the element are not waited for. A
chunk is imported once (concurrent loads share it, a failed import is retried); `app` and `container` always win over
params of the same name.

A page registered by its own entry script (`app.registerPage('dashboard', page)`, without a `pages` loader) may load
after the app has mounted: its markers wait, then run once that script has finished evaluating, so the page can read
bindings its module declares after the `registerPage()` call.

### Services and parameters

```js
const app = new App({
    parameters: window.appConfig, // { locale, routes, sentryDsn… }
    services: {
        translator: async () => new (await import('./Translator')).default(),
        modalManager: (container) => new ModalManager(container.get('translator')),
    },
})

app.get('modalManager') // built on first use, then shared
app.getParameter('locale')
```

Factories receive the container and run on the first `get()`. An async factory is shared while pending and retried
after a rejection. Mistyped ids get a Symfony-style hint (`Did you mean this: "modalManager"?`), cycles report their
path, and replacing a service that was already built throws. Parameters are plain values, functions included: they are
never called. `app` is always registered.

Type the ids with declaration merging, the way a compiled Symfony container does:

```ts
declare module '@silarhi/app-js' {
    interface ServiceMap {
        modalManager: ModalManager
        translator: Promise<Translator>
    }
    interface ParameterMap {
        locale: string
    }
}
```

Or derive the map from the registrations, so there is no second list to keep in sync. Factories that read the
container need an explicit return type, otherwise inference loops through `ServiceMap`:

```ts
export const services = defineServices({
    translator: async () => new Translator(),
    modalManager: async (c): Promise<ModalManager> => new ModalManager(await c.get('translator')),
})

declare module '@silarhi/app-js' {
    interface ServiceMap extends ServicesOf<typeof services> {}
}
```

A class can also be its own id, typed with no declaration: `app.container.set(ToastManager, () => new ToastManager())`,
then `app.get(ToastManager)`.

### Errors

Every error the app catches — a module failing to start, a listener failing to connect or disconnect, a page failing
to load — goes to `onError`, `console.error` by default:

```js
const app = new App({
    onError: (error, context) => Sentry.captureException(error, { extra: context }),
})
```

`context.type` is `'module'`, `'connect'`, `'disconnect'` or `'page'`, with the module, listener and element, or page id
that failed. Listeners and pages can call `app.reportError(error, context)` to report their own failures the same way.

### Utilities

`domReady`, `byId(id, scope?)`, `findOne`, `findAll` (an array), `findAllSelf`, `on` (returns its removal), `trigger` (bubbling, cancelable
`CustomEvent`, returned), `escapeHtml`, `appendHTML` (returns the appended elements) and `show` / `hide` / `toggle`
(a `hidden` class by default; pass `'d-none'` for plain Bootstrap).

`byId(id, HTMLInputElement, scope?)` checks the type instead of asserting it: an element of another type is `null`,
like a missing one. `setHiddenClass('d-none')`, once at boot, makes `show` / `hide` / `toggle` and the form fields use
that class when none is passed; it returns the restoration of the previous one.

### Forms

```js
import { CollectionManager, collectionListener, Field, FormDefinition, formView } from '@silarhi/app-js/form'
```

**Form views.** `formView()` reads a rendered Symfony form straight from the DOM, by path:

```twig
<div {{ load_page('party', {form: form.vars.id}) }}>{{ form(form) }}</div>
```

```js
export default function party({ form: id }) {
    const form = formView(id) // or formView(formElement), formView(anyContainer)

    form.get('address.city') // a FormView node: id, fullName, name, path, parent, element, children
    form.get('phones.2.number') // collection items by index
    form.has('siren') // false when the field is not rendered
    form.get('adress') // throws a FieldNotFoundError: No field "adress" in "user". Did you mean this: "address"?
    form.get('phones').children // the rendered items, in document order
    form.get('phones').childOf(row) // the item a row belongs to, from the names inside it

    form.field('tags').value // ['a', 'c']: the node's Field
    form.field('address.city').setValue('Toulouse')
}
```

Symfony builds every id and name from the path (`user_address_city`, `user[address][city]`), so nothing is parsed
back from ids, where `_` in field names would be ambiguous, and nothing is cached: items added later are found
right away. A node only navigates; `field(path)` returns its `Field`, one per node, following the DOM too.

**Fields.** `Field` is what a page does with a field, with or without a form view:

```js
const city = new Field(document.getElementById('user_address_city')) // a control, a radio (its group),
const tags = new Field(document.getElementById('user_tags')) //          or a container (an expanded choice)

tags.value // ['a', 'c']: a checkbox is a boolean, a radio group its value, an expanded choice an array
tags.setValue(['b']) // fires `input` then `change`, bubbling, on what it changed; { silent: true } skips them
city.setRequired(true) // the control (every radio of a group; aria-required on a checkbox group) and its label
city.setDisabled(true)
city.required // true; city.disabled too: read back through the behavior levels like the rest
city.hide() // its group; city.setVisible(false, 'self') hides the element itself
city.empty() // setValue(null): unchecked, cleared, or no option selected
city.onChange(handler) // returns the removal
```

**Behaviors.** Each operation of a field is a part of a `FieldBehavior`: `getValue`, `setValue`, `isRequired`,
`setRequired`, `isDisabled`, `setDisabled` and `on` for the control; `group`, `label`, `setVisible` and `markRequired`
for the markup. A field resolves each part on every call through four levels, the first that implements it winning:

| Level   | Set with                             | For                                                          |
| ------- | ------------------------------------ | ------------------------------------------------------------ |
| Field   | `new Field(el, { behavior })`        | one field                                                    |
| Element | `bindField(el, behavior)`            | a library that took the element over (tom-select, a picker…) |
| App     | `setFieldDefaults(...behaviors)`     | the whole app, at boot: markup conventions, app-wide rules   |
| Native  | built in                             | the browser's controls and Symfony's Bootstrap markup        |

Every part takes one object: the field, its own parameters, and `next()` to let the level below answer, before or
after its own work. Destructure only what you use:

```js
import { bindField, bootstrapTheme, setFieldDefaults } from '@silarhi/app-js/form'

// App: the markup convention, and a rule for date inputs only; the rest goes to next()
setFieldDefaults(bootstrapTheme({ groupSelector: '.mb-3', hiddenClass: 'd-none' }), {
    getValue: ({ field, next }) => (field.element?.matches('[data-date]') ? toIso(field.element.value) : next()),
})

// Element: from the listener that enhances it
export default defineListener({
    selector: 'select[data-autocomplete]',
    connect(select) {
        const ts = new TomSelect(select)
        const unbind = bindField(select, {
            getValue: () => ts.getValue(),
            setValue: ({ value, silent }) => ts.setValue(value ?? '', silent), // null empties; notify unless silent
            setDisabled: ({ disabled }) => (disabled ? ts.disable() : ts.enable()),
        })

        return () => {
            unbind()
            ts.destroy()
        }
    },
})

// Field: one instance, wrapping the level below
new Field(el, {
    behavior: {
        markRequired: ({ label, required, next }) => {
            next() // the `required` class
            label.toggleAttribute('data-required', required)
        },
    },
})

formView(id, { field: { behavior } }) // every field of the form; same `field` option on FormDefinition
```

A part left out falls to the level below, so a tom-select binding that only takes over `setRequired` still gets its
label marked by `markRequired`. Bind the control, or an expanded choice's container. The app defaults are read on
every call: `setFieldDefaults()` replaces them and returns their restoration. `bootstrapTheme({ groupSelector,
hiddenClass, requiredClass })` returns the markup parts; the native level uses its defaults (`.form-group`, a `hidden`
class, a `required` label class), and its `label` looks in `field.group`, so a `group` from any level moves it too.

**Collections.** `CollectionManager` adds items from `data-prototype` and removes them, mounting new items and
unmounting removed ones. It is a service like any other, given its app; `collectionListener(id)` hands it the add and
remove buttons, reading the service from the app on the first click, so the manager is only built where a collection
is used:

```ts
const app = new App({
    services: {
        collections: (container): CollectionManager =>
            new CollectionManager({
                app: container.get('app'),
                confirm: (message) => container.get('modalManager').confirm(message), // default: window.confirm
                selectors: { collection: '.form-collection' }, // item, wrapper
            }),
    },
    listeners: [collectionListener('collections')], // or ('collections', { add: '.add-row', remove: '.remove-row' })
})
```

The id is typed against `ServiceMap`: `collectionListener()` only takes the id of a `CollectionManager` service. The
markup selectors are the manager's (`DEFAULT_SELECTORS`), the button selectors the listener's
(`DEFAULT_BUTTON_SELECTORS`). An add button adds to the collection of its wrapper, as `collections.addFrom(button)`
does; a remove button's click does not bubble.

The lifecycle goes through bubbling events on the collection element, with `{ collection, item, index }` as detail.
Listen on `document` for every collection, or on one collection element:

| Event                | When                                                  |
| -------------------- | ----------------------------------------------------- |
| `collection.add`     | new item in the DOM, before it is mounted             |
| `collection.added`   | after it is mounted                                   |
| `collection.remove`  | before confirmation; `preventDefault()` keeps the item |
| `collection.removed` | item unmounted and removed                            |

Importing `@silarhi/app-js/form` types them in `HTMLElementEventMap` and `DocumentEventMap`, so
`on(document, 'collection.added', (event) => event.detail.item)` needs no cast.

Only remove buttons with a `data-confirm-message` ask for confirmation.

From a page, `collections.each(form.get('items'), ({ item, index, form }) => form.field('label').onChange(…))`
runs for existing items and for every added one, with each item as a `FormView`, and returns its unsubscription.
A collection can be given as its `FormView`, its element or its id. `add(collection, values)` adds an item already
filled, keyed like its fields: nested objects fill embedded forms, arrays add nested collection items, `{ id }` selects
an entity. The filling itself is `fillForm(node, values, addItem)`, exported for custom item flows:

```js
collections.add(form.get('phones'), { number: '0102', type: { id: 3 }, tags: ['work'] })
```

The next index comes from `data-index` when the template renders it (Symfony's documented
`data-index="{{ form|length > 0 ? form|last.vars.name + 1 : 0 }}"`), else from the highest index in the items' ids.
It is then kept in `data-index`, so an index is never reused after a removal.

**Dependent fields.** `FormDefinition` shows, hides, requires, disables or empties fields depending on others:

```js
export default function party({ form: id }) {
    const definition = new FormDefinition({ form: formView(id) })
    definition.when('hasVAT').isChecked().showAndRequire('VATStartDate')
    definition.when('type').equals('company').show('siren', 'vatNumber')

    return definition.apply() // the page cleanup
}
```

With `form`, string targets are paths; without, element ids. Targets can also be elements, `Field`s, `FormView`s, or
`block(target)` to toggle the element itself instead of its `.form-group`. A mistyped path fails at `apply()` with
the rule it belongs to: `Cannot resolve the "show" target of rule #2: No field "sirne" in "party"…`.

Rules follow values set by code too, since `setValue()` notifies, and they cascade: a field a rule empties feeds the
rules that read it. A hidden target is never required (the browser would block the submit on a field nobody can see);
shown again, it is required as its `.require()` rules say, else as Symfony rendered it.

**Values.** `getElementValue` / `setElementValue` read and write a single control (checkbox → boolean, radio → its
group's value, multiple select → array). They only touch the native control: a widget that took it over is driven
through its `bindField()` behavior. `radioGroup(radio)` returns the radios
sharing its name within its form, as the browser groups them.

**Errors.** A missing path or id throws a `FieldNotFoundError` (a `ReferenceError`) with its `path` and the closest
existing names in `suggestions`, so an optional field can be told apart from a typo. A rule that cannot resolve its
source or target throws a `FormRuleError` from `apply()`, with the 1-based `rule`, its `role` (`source`, `show`,
`require`…) and the underlying error as `cause`.

### With Hotwire Turbo

Drive `mount` / `unmount` from [`@silarhi/turbo`](https://www.npmjs.com/package/@silarhi/turbo):

```js
import { TurboHandler } from '@silarhi/turbo'

app.start()
new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
}).start()
```

Turbo moves `data-turbo-permanent` elements to the next page instead of rendering them again. Tell the app, so a page
unmount leaves what they hold connected instead of tearing it down and connecting it again:

```js
const app = new App({ persistent: '[data-turbo-permanent]', listeners: [/* … */] })
```

An unmount of the persistent element itself, or of a frame inside it, still disconnects what it covers, and a
persistent element the next page dropped is disconnected by the next unmount.

### HTTP

```js
import { errorBody, getHtml, getJson, postForm, sendJson, statusOf } from '@silarhi/app-js/http'

const html = await getHtml(link.href) // then appendHTML() and app.mount() it
const events = await getJson('/api/events', { params: { city: 'toulouse', page: 2 } })
await sendJson('PUT', `/api/events/${id}/like`, { like: true })
await postForm(form.action, form) // multipart, as the browser sends it, files included
```

Every request carries `X-Requested-With: XMLHttpRequest`, so `Request::isXmlHttpRequest()` can answer a fragment.
An answer outside 2xx rejects with an `HttpError` holding its `status` and, when it is JSON, its `body`:

```js
try {
    await postForm('/register', form)
} catch (error) {
    if (statusOf(error) === 422) {
        showViolations(errorBody(error)?.violations) // the server's JSON, unchecked
    } else if (statusOf(error) === 0) {
        // no answer at all: offline, blocked
    }
}
```

`sendJson()` and `postForm()` resolve to the JSON answer, `null` when there is none (204) or it is not JSON. Each
helper takes `fetch()` options last (headers, `signal`…), and `request(url, init)` is the base they share.

### Testing

`@silarhi/app-js/testing` brings no test runner of its own: reset its fixtures from yours.

```js
import { connectListener, mountFixture, resetFixtures } from '@silarhi/app-js/testing'
import { afterEach, expect, it } from 'vitest'
import autosubmit from '../listeners/autosubmit'

afterEach(resetFixtures) // unmounts the fixtures' apps (listeners bound to `document` too) and empties the body

it('submits on change', () => {
    mountFixture('<form><select data-autosubmit></select></form>', { listeners: [autosubmit] })
    // …
})

it('cleans up', () => {
    const select = document.createElement('select')
    const cleanup = connectListener(autosubmit, select) // throws if the listener returns no cleanup
    cleanup()
})
```

`mountFixture(html, options)` renders the body, then starts and mounts an `App` built from `options`; await
`app.whenConnected()` for async connects. `connectListener(listener, element, app?)` connects one listener as
`mount()` would and returns its cleanup; `connectListenerWithoutCleanup()` is for a listener that leaves nothing to
undo, `connectListenerAsync()` for an async `connect`. Without `app`, a bare one is passed.

## License

MIT
