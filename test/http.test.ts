/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorBody, getHtml, getJson, HttpError, postForm, request, sendJson, statusOf } from '../src/http'

const json = (body: unknown, status = 200, type = 'application/json'): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } })

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

/** The URL and options of the only request sent. */
function sent(): { url: string; init: RequestInit; headers: Headers } {
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init = {}] = fetchMock.mock.calls[0]

    return { url: String(url), init, headers: new Headers(init.headers) }
}

beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('request', () => {
    it('marks every request as an AJAX one, keeping the given headers', async () => {
        fetchMock.mockResolvedValue(new Response('<li>Concert</li>'))

        expect(await getHtml('/agenda/2', { headers: { 'X-Custom': 'yes' } })).toBe('<li>Concert</li>')
        expect(sent().headers.get('X-Requested-With')).toBe('XMLHttpRequest')
        expect(sent().headers.get('X-Custom')).toBe('yes')
    })

    it('rejects an answer outside 2xx with its status and JSON body', async () => {
        fetchMock.mockResolvedValue(json({ violations: [{ propertyPath: 'email' }] }, 422, 'application/problem+json'))

        const error = await request('/register').catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(HttpError)
        expect(statusOf(error)).toBe(422)
        expect(errorBody<{ violations: unknown[] }>(error)?.violations).toHaveLength(1)
    })

    it('keeps no body when the failed answer is not JSON', async () => {
        fetchMock.mockResolvedValue(new Response('<h1>Oops</h1>', { status: 500 }))

        const error = await getHtml('/agenda').catch((caught: unknown) => caught)

        expect(statusOf(error)).toBe(500)
        expect(errorBody(error)).toBeUndefined()
    })

    it('takes a request that got no answer as status 0', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

        const error = await getHtml('/agenda').catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(TypeError)
        expect(statusOf(error)).toBe(0)
        expect(errorBody(error)).toBeUndefined()
    })
})

describe('getJson', () => {
    it('adds the parameters to the query and asks for JSON', async () => {
        fetchMock.mockResolvedValue(json({ member: [] }))

        expect(await getJson('/api/search?page=1', { params: { q: 'jazz & blues', city: null, limit: 5 } })).toEqual({
            member: [],
        })
        expect(sent().url).toBe(`${window.location.origin}/api/search?page=1&q=jazz+%26+blues&limit=5`)
        expect(sent().headers.get('Accept')).toBe('application/json')
    })

    it('keeps the format it is asked for', async () => {
        fetchMock.mockResolvedValue(json({ member: [] }, 200, 'application/ld+json; charset=utf-8'))

        await getJson('/api/events', { headers: { Accept: 'application/ld+json' } })

        expect(sent().headers.get('Accept')).toBe('application/ld+json')
    })
})

describe('sendJson', () => {
    it('sends a JSON body and reads the JSON answer', async () => {
        fetchMock.mockResolvedValue(json({ like: true }))

        expect(await sendJson('PUT', '/api/events/42/like', { like: true })).toEqual({ like: true })
        const { init, headers } = sent()
        expect(init.method).toBe('PUT')
        expect(init.body).toBe('{"like":true}')
        expect(headers.get('Content-Type')).toBe('application/json')
    })

    it('reads an answer without a JSON body as null', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

        expect(await sendJson('DELETE', '/api/events/42', null)).toBeNull()
    })
})

describe('postForm', () => {
    it('posts the form as the browser would', async () => {
        document.body.innerHTML = '<form><input name="comment" value="Great"><input name="rating" value="5"></form>'
        fetchMock.mockResolvedValue(json({ id: 7 }))

        expect(await postForm('/comments', document.querySelector('form') as HTMLFormElement)).toEqual({ id: 7 })
        const { init } = sent()
        expect(init.method).toBe('POST')
        expect(init.body).toBeInstanceOf(FormData)
        expect([...(init.body as FormData)]).toEqual([
            ['comment', 'Great'],
            ['rating', '5'],
        ])
    })

    it('posts nothing without a form, and reads an HTML answer as null', async () => {
        fetchMock.mockResolvedValue(new Response('<p>Done</p>', { headers: { 'Content-Type': 'text/html' } }))

        expect(await postForm('/events/42/remind')).toBeNull()
        expect(sent().init.body).toBeUndefined()
    })
})
