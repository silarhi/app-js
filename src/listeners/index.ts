/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/**
 * Ready-made listeners with no library behind them. Each export is a factory
 * whose options default to `data-` attributes, so an app only bundles the
 * ones it registers:
 *
 *     new App({ listeners: [autoSubmit(), checkAll({ item: '.check-item' })] })
 */

export { type AutoSubmitOptions, autoSubmit } from './autoSubmit'
export { type CheckAllOptions, checkAll } from './checkAll'
export { type CopyToClipboardOptions, copyToClipboard } from './copyToClipboard'
export { type PasswordToggleOptions, passwordToggle } from './passwordToggle'
export { type SubmitOnceOptions, submitOnce } from './submitOnce'
export { WEBAUTHN_MESSAGES, type WebauthnMessages, type WebauthnOptions, webauthn } from './webauthn'
