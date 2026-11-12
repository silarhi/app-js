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
 *         name: FormField                                // a control, a radio group, an expanded choice
 *         address: { city: FormField }                   // an embedded form
 *         phones: FormCollection<{ number: FormField }>  // a collection: `phones.0.number`
 *         siren?: FormField                              // not always rendered: through `find()`
 *     }
 *
 * Types only: nothing here exists at runtime, the DOM stays the source.
 */

declare const field: unique symbol
declare const collection: unique symbol

/** A leaf: a control, a radio group, or an expanded choice. */
export interface FormField {
    readonly [field]: true
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

/** The node at `P` in `S`. */
export type FormNodeAt<S, P extends string> =
    IsAny<S> extends true
        ? AnyShape
        : P extends `${infer Head}.${infer Rest}`
          ? FormNodeAt<FormNodeAt<S, Head>, Rest>
          : NonNullable<S> extends FormCollection<infer Item>
            ? Item
            : P extends keyof NonNullable<S>
              ? NonNullable<NonNullable<S>[P]>
              : never

/** The shape of a child: an item of a collection, untyped otherwise. */
export type FormChild<S> = NonNullable<S> extends FormCollection<infer Item> ? Item : AnyShape
