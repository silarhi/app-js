/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/**
 * AJAX requests over `fetch()`, with what a Symfony app expects of them:
 * - `X-Requested-With: XMLHttpRequest`, so `Request::isXmlHttpRequest()` can
 *   answer a fragment instead of a page
 * - an answer outside 2xx rejects (`fetch()` resolves it), carrying its JSON
 *   body: the violations of a 422, the detail of a 429
 *
 * A request that gets no answer (offline, blocked) rejects with `fetch()`'s
 * `TypeError`, whose status `statusOf()` takes as 0.
 */

/** An answer outside 2xx. */
export class HttpError extends Error {
    constructor(
        readonly status: number,
        /** The answer's body when it is JSON, else `undefined`. */
        readonly body: unknown
    ) {
        super(`HTTP ${status}`)
        this.name = 'HttpError'
    }
}

/** The HTTP status a request failed with: 0 when it got no answer. */
export function statusOf(error: unknown): number {
    return error instanceof HttpError ? error.status : 0
}

/** The JSON body of a failed request, if it had one, as the server describes it (unchecked). */
export function errorBody<T extends object>(error: unknown): Partial<T> | undefined {
    if (!(error instanceof HttpError) || error.body === null || typeof error.body !== 'object') {
        return undefined
    }

    return error.body as Partial<T>
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>

export interface JsonRequestInit extends RequestInit {
    /** Added to the URL's query; `null` and `undefined` are left out. */
    params?: QueryParams
}

const isJson = (response: Response): boolean => /[/+]json\b/.test(response.headers.get('Content-Type') ?? '')

/**
 * `fetch()` with `X-Requested-With`, rejecting with an `HttpError` outside
 * 2xx: the base of the helpers below, for a request they do not cover.
 */
export async function request(url: string | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('X-Requested-With', 'XMLHttpRequest')

    const response = await fetch(url, { ...init, headers })
    if (!response.ok) {
        throw new HttpError(
            response.status,
            isJson(response) ? await response.json().catch(() => undefined) : undefined
        )
    }

    return response
}

/** GETs an HTML fragment. */
export async function getHtml(url: string | URL, init: RequestInit = {}): Promise<string> {
    return (await request(url, init)).text()
}

/** GETs JSON, with `params` added to the URL's query. */
export async function getJson<T>(url: string | URL, { params, ...init }: JsonRequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json')
    }

    return (await request(withParams(url, params), { ...init, headers })).json()
}

/** Sends `data` as a JSON body; resolves to the JSON answer, `null` when there is none (204). */
export async function sendJson<T = unknown>(
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string | URL,
    data: unknown,
    init: RequestInit = {}
): Promise<T | null> {
    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json')

    return readJson<T>(await request(url, { ...init, method, headers, body: JSON.stringify(data) }))
}

/**
 * POSTs a form as the browser would (`multipart/form-data`, files included),
 * or nothing at all; resolves to the JSON answer, `null` when it is not JSON.
 */
export async function postForm<T = unknown>(
    url: string | URL,
    form?: HTMLFormElement | FormData,
    init: RequestInit = {}
): Promise<T | null> {
    const body = form instanceof HTMLFormElement ? new FormData(form) : form

    return readJson<T>(await request(url, { ...init, method: 'POST', body }))
}

async function readJson<T>(response: Response): Promise<T | null> {
    return isJson(response) ? response.json() : null
}

function withParams(url: string | URL, params: QueryParams = {}): URL {
    const target = new URL(url, window.location.href)
    for (const [name, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
            target.searchParams.set(name, String(value))
        }
    }

    return target
}
