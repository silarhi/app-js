/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/*
 * The shape of a rendered form, for `formView<Shape>()`: which paths exist,
 * checked when compiling. Three kinds of nodes:
 *
 *     interface UserForm {
 *         name: FormField<HTMLInputElement, string>      // a control, a radio group, an expanded choice
 *         country: FormField<HTMLSelectElement>          // `element` and `field().element` are a <select>
 *         tags: FormField<HTMLElement, string[]>         // `field('tags').value` is a string[]
 *         address: { city: FormField }                   // an embedded form
 *         phones: FormCollection<{ number: FormField }>  // a collection: `phones.0.number`
 *         siren?: FormField                              // not always rendered: through `find()`
 *     }
 *
 * Types only: nothing here exists at runtime, the DOM stays the source.
 */

import type { FieldValue } from './values'

declare const field: unique symbol
declare const value: unique symbol
declare const collection: unique symbol

/**
 * A leaf: a control, a radio group, or an expanded choice, rendered as `E`
 * (the control, or the container of an expanded choice) and read as `V`: a
 * `string`, a `boolean` checkbox, the `string[]` of a multiple choice.
 */
export interface FormField<E extends HTMLElement = HTMLElement, V extends FieldValue = FieldValue> {
    readonly [field]: E
    readonly [value]: V
}

/** A collection whose items have the shape `Item`. */
export interface FormCollection<Item> {
    readonly [collection]: Item
}

/** No shape given: every string is a path, every node is untyped. */
// biome-ignore lint/suspicious/noExplicitAny: the escape hatch of an untyped form
export type AnyShape = any

type IsAny<S> = 0 extends 1 & S ? true : false

/** Keys to follow: every one, or only those always rendered. */
type Keys<S, Optional extends boolean> = Optional extends true
    ? keyof S & string
    : { [K in keyof S & string]-?: undefined extends S[K] ? never : K }[keyof S & string]

type PathsOf<K extends string, Node, Optional extends boolean> = Node extends FormField
    ? K
    : Node extends FormCollection<infer Item>
      ? K | `${K}.${number}` | `${K}.${number}.${Paths<Item, Optional>}`
      : K | `${K}.${Paths<Node, Optional>}`

type Paths<S, Optional extends boolean> =
    IsAny<S> extends true
        ? string
        : S extends FormCollection<infer Item>
          ? `${number}` | `${number}.${Paths<Item, Optional>}`
          : { [K in Keys<S, Optional>]-?: PathsOf<K, NonNullable<S[K]>, Optional> }[Keys<S, Optional>]

/** Every path of a shape, the ones not always rendered included. */
export type FormPath<S> = Paths<S, true>

/** The paths of a shape that are always rendered: no optional node on the way. */
export type RequiredFormPath<S> = Paths<S, false>

/** The node at `P` in `S`, `S` itself at `''`. */
export type FormNodeAt<S, P extends string> =
    IsAny<S> extends true
        ? AnyShape
        : P extends ''
          ? S
          : P extends `${infer Head}.${infer Rest}`
            ? FormNodeAt<FormNodeAt<S, Head>, Rest>
            : NonNullable<S> extends FormCollection<infer Item>
              ? Item
              : P extends keyof NonNullable<S>
                ? NonNullable<NonNullable<S>[P]>
                : never

/** The shape of a child: an item of a collection, untyped otherwise. */
export type FormChild<S> = NonNullable<S> extends FormCollection<infer Item> ? Item : AnyShape

/**
 * The element a node is rendered as: the one its {@link FormField} names, an
 * `HTMLElement` for a form, a collection, or a field without one.
 */
export type FormElement<S> =
    IsAny<S> extends true ? HTMLElement : NonNullable<S> extends FormField<infer E> ? E : HTMLElement

/**
 * The value a node is read as: the one its {@link FormField} names, any
 * {@link FieldValue} otherwise.
 */
export type FormFieldValue<S> =
    IsAny<S> extends true ? FieldValue : NonNullable<S> extends FormField<HTMLElement, infer V> ? V : FieldValue

/**
 * What `setValue()` takes for a field read as `V`: `V` itself, `null` to
 * empty it, a number for a string.
 */
export type FieldInput<V extends FieldValue = FieldValue> = V | null | (V extends string ? number : never)

/** What fills a field read as `V`: what `setValue()` takes, or an entity by its id. */
export type FormValue<V extends FieldValue = FieldValue> = FieldInput<V> | { id: unknown }

/**
 * Values keyed like the fields of `S`, for `fillForm()` and
 * `CollectionManager.add()`: nested objects for embedded forms, arrays for
 * collections. Any key goes without a shape.
 */
export type FormValues<S> =
    IsAny<S> extends true ? Record<string, unknown> : { [K in keyof S & string]?: ValueOf<NonNullable<S[K]>> }

/**
 * What fills a collection item of shape `Item`, for `CollectionManager.add()`:
 * a value for an item that is a field (`notes: FormCollection<FormField>`),
 * values keyed like its fields otherwise. Either without a shape.
 */
export type FormItemValues<Item> =
    IsAny<Item> extends true
        ? FormValues<AnyShape> | FormValue
        : Item extends FormField
          ? FormValue<FormFieldValue<Item>>
          : FormValues<Item>

type ValueOf<Node> = Node extends FormField
    ? FormValue<FormFieldValue<Node>>
    : Node extends FormCollection<infer Item>
      ? Array<FormItemValues<Item>>
      : FormValues<Node>
