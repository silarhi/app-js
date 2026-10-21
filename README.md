# @silarhi/app-js

Tiny, framework-agnostic orchestrator for server-rendered apps. No runtime dependency: no jQuery, no Bootstrap, no
Turbo required.

- **Modules** — boot-once hooks (`document` / `window` / library globals), run by `app.start()`
- **Listeners** — `{ selector, connect(element, { app }) }`, connected once per element on every `app.mount(container)`;
  the optional returned cleanup runs on `app.unmount(container)`
- **Pages** — lazy initializers declared in markup (`data-page`), each shipped in its own chunk

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

Everything is the consumer's: the library ships no listener or module of its own, only the built-in `data-page` one.
More can be registered at any time with `app.addModule()`, `app.addListener()`, `app.addPages()` or
`app.registerPage()`, so a shared package can export its own listeners for apps to spread in.

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

### Pages

```html
<div data-page='["user-form"]' data-page-params='{"userId": 42}'></div>
<div data-page="dashboard"></div>
```

```js
// pages/user-form.js
export default function userForm({ app, container, userId }) {
    // …
    return () => {
        /* cleanup */
    }
}
```

The `data-page` listener always connects after the consumer's listeners, so page code can rely on them. A chunk is
imported once (concurrent loads share it, a failed import is retried); `app` and `container` always win over params
of the same name.

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

## License

MIT
