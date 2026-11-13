/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { FormView } from './FormView'
import type { AnyShape, FormValues } from './shape'

/**
 * Adds an item to a nested collection, rendered and filled with `values`.
 */
export type AddItem = (collection: FormView, values: FormValues<AnyShape>) => void

/**
 * Fill a form node from plain values keyed like its fields, as
 * `CollectionManager.add(collection, values)` does for a new item:
 *
 * - a nested object fills an embedded form;
 * - an array on a collection (`data-prototype`) adds one item per entry,
 *   through `addItem`;
 * - `{ id, … }` selects an entity by its id;
 * - anything else is the field's value (an array for a multiple choice).
 *
 * Keys without a rendered field and `undefined` values are skipped. Given a
 * typed view, `values` is checked against its shape.
 */
export function fillForm<S = AnyShape>(view: FormView<S>, values: FormValues<NoInfer<S>>, addItem: AddItem): void {
    // Keys are checked by the signature; the walk itself is untyped
    const form: FormView = view
    for (const [name, value] of Object.entries(values as Record<string, unknown>)) {
        if (value === undefined || !form.has(name)) {
            continue
        }

        const node = form.get(name)
        if (Array.isArray(value) && node.element?.dataset.prototype !== undefined) {
            for (const itemValues of value) {
                addItem(node, itemValues as Record<string, unknown>)
            }
        } else if (node.inputs.length === 0 && typeof value === 'object' && value !== null) {
            fillForm(node, value as Record<string, unknown>, addItem)
        } else {
            const id = (value as { id?: unknown } | null)?.id
            node.field().setValue((id ?? value) as string)
        }
    }
}
