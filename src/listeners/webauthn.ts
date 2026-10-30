/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { on } from '../dom'
import type { Listener } from '../types'

export interface WebauthnMessages {
    /** The browser has no WebAuthn. */
    unsupported: string
    /** Cancelled, timed out, or no matching passkey: the browser does not tell which. */
    notAllowed: string
    /** A registration of a passkey the account already has. */
    alreadyRegistered: string
    /** Any other failure, given the browser's message. */
    failed: (message: string) => string
}

export interface WebauthnOptions {
    /** Default `form[data-webauthn-options]`. */
    selector?: string
    messages?: Partial<WebauthnMessages>
}

export const WEBAUTHN_MESSAGES: WebauthnMessages = {
    unsupported: 'Your browser does not support passkeys.',
    notAllowed: 'The passkey was not used: try again.',
    alreadyRegistered: 'This passkey is already registered on your account.',
    failed: (message) => `The passkey failed: ${message}`,
}

/**
 * The passkey ceremonies of a form: on submit, ask the browser for a passkey
 * with the options of `data-webauthn-options` (the JSON of
 * jbtronics/2fa-webauthn, or any server sending binary values in base64url),
 * write its answer as JSON in the form's `[data-webauthn-response]` field,
 * then submit the form.
 *
 * - `data-webauthn-action="register"`: a new passkey (`navigator.credentials.create()`)
 * - otherwise: a login or its second factor (`navigator.credentials.get()`)
 *
 * A failure is shown in the form's `[data-webauthn-error]` element, unhidden.
 * Unmounting the form aborts a pending ceremony.
 */
export function webauthn({
    selector = 'form[data-webauthn-options]',
    messages = {},
}: WebauthnOptions = {}): Listener<HTMLFormElement> {
    const text = { ...WEBAUTHN_MESSAGES, ...messages }

    return {
        selector,
        connect(form) {
            const errorElement = form.querySelector<HTMLElement>('[data-webauthn-error]')
            const showError = (message: string) => {
                if (errorElement) {
                    errorElement.textContent = message
                    errorElement.hidden = false
                }
            }

            const controller = new AbortController()

            const onSubmit = async (event: SubmitEvent) => {
                // Before any await: only a synchronous call cancels the submission
                event.preventDefault()
                if (errorElement) {
                    errorElement.hidden = true
                }

                if (!window.PublicKeyCredential) {
                    showError(text.unsupported)
                    return
                }

                try {
                    const options = JSON.parse(form.dataset.webauthnOptions ?? '{}')
                    const credential =
                        form.dataset.webauthnAction === 'register'
                            ? await navigator.credentials.create({
                                  publicKey: decodeCreationOptions(options),
                                  signal: controller.signal,
                              })
                            : await navigator.credentials.get({
                                  publicKey: decodeRequestOptions(options),
                                  signal: controller.signal,
                              })

                    const field = form.querySelector<HTMLInputElement>('[data-webauthn-response]')
                    if (!(credential instanceof PublicKeyCredential) || !field) {
                        return
                    }
                    field.value = JSON.stringify(encodeCredential(credential))
                    // The native submit() fires no submit event, so it does not ask again
                    form.submit()
                } catch (error) {
                    // A DOMException, not always an Error instance
                    const { name = '', message = String(error) } = (
                        typeof error === 'object' && error !== null ? error : {}
                    ) as { name?: string; message?: string }
                    if (name === 'AbortError') {
                        return
                    }
                    showError(
                        name === 'NotAllowedError'
                            ? text.notAllowed
                            : name === 'InvalidStateError'
                              ? text.alreadyRegistered
                              : text.failed(message)
                    )
                }
            }

            const off = on(form, 'submit', onSubmit)

            return () => {
                off()
                controller.abort()
            }
        },
    }
}

/** A credential descriptor as the server sends it: its id in base64url */
type CredentialDescriptorJson = Omit<PublicKeyCredentialDescriptor, 'id'> & { id: string }

/** The options of a registration as the server sends them: every binary value in base64url */
type CreationOptionsJson = Omit<PublicKeyCredentialCreationOptions, 'challenge' | 'user' | 'excludeCredentials'> & {
    challenge: string
    user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string }
    excludeCredentials?: CredentialDescriptorJson[]
}

/** The options of a login as the server sends them */
type RequestOptionsJson = Omit<PublicKeyCredentialRequestOptions, 'challenge' | 'allowCredentials'> & {
    challenge: string
    allowCredentials?: CredentialDescriptorJson[]
}

// WebAuthn sends every binary value in base64url (RFC 4648 §5); the browser API wants and returns ArrayBuffers
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')

    return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
}

function toBase64Url(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

function decodeCredentials(credentials?: CredentialDescriptorJson[]): PublicKeyCredentialDescriptor[] | undefined {
    return credentials?.map((credential) => ({ ...credential, id: fromBase64Url(credential.id) }))
}

function decodeCreationOptions(options: CreationOptionsJson): PublicKeyCredentialCreationOptions {
    return {
        ...options,
        challenge: fromBase64Url(options.challenge),
        user: { ...options.user, id: fromBase64Url(options.user.id) },
        excludeCredentials: decodeCredentials(options.excludeCredentials),
    }
}

function decodeRequestOptions(options: RequestOptionsJson): PublicKeyCredentialRequestOptions {
    return {
        ...options,
        challenge: fromBase64Url(options.challenge),
        allowCredentials: decodeCredentials(options.allowCredentials),
    }
}

function encodeCredential(credential: PublicKeyCredential) {
    const response = credential.response as AuthenticatorResponse &
        Partial<AuthenticatorAttestationResponse> &
        Partial<Omit<AuthenticatorAssertionResponse, 'userHandle'>> & { userHandle?: ArrayBuffer | null }
    const encoded: { id: string; type: string; rawId: string; response: Record<string, unknown> } = {
        id: credential.id,
        type: credential.type,
        rawId: toBase64Url(credential.rawId),
        response: { clientDataJSON: toBase64Url(response.clientDataJSON) },
    }

    for (const name of ['attestationObject', 'authenticatorData', 'signature', 'userHandle'] as const) {
        const value = response[name]
        if (value) {
            encoded.response[name] = toBase64Url(value)
        }
    }
    if (typeof response.getTransports === 'function') {
        encoded.response.transports = response.getTransports()
    }

    return encoded
}
