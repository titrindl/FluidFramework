/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	EmptyKey,
	ITreeCursorSynchronous,
	TreeNodeSchemaIdentifier,
	TreeValue,
} from "../core/index.js";
import {
	FlexAllowedTypes,
	FlexFieldNodeSchema,
	FlexTreeFieldNode,
	FlexTreeNode,
	FlexTreeNodeSchema,
	FlexTreeSequenceField,
	FlexTreeTypedField,
	FlexTreeUnboxField,
} from "../feature-libraries/index.js";
import {
	FactoryContent,
	InsertableContent,
	getOrCreateNodeProxy,
	markContentType,
	prepareContentForInsert,
} from "./proxies.js";
import { getFlexNode } from "./proxyBinding.js";
import {
	NodeKind,
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchemaClass,
	WithType,
	TreeNodeSchema,
	type,
	normalizeFieldSchema,
} from "./schemaTypes.js";
import { cursorFromFieldData } from "./toMapTree.js";
import { TreeNode, TreeNodeValid } from "./types.js";
import { fail } from "../util/index.js";
import { getFlexSchema } from "./toFlexSchema.js";
import { RawTreeNode, rawError } from "./rawNode.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * A generic array type, used to defined types like {@link (TreeArrayNode:interface)}.
 *
 * @privateRemarks
 * Inlining this into TreeArrayNode causes recursive array use to stop compiling.
 *
 * @public
 */
export interface TreeArrayNodeBase<out T, in TNew, in TMoveFrom>
	extends ReadonlyArray<T>,
		TreeNode {
	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert `value`.
	 * @param value - The content to insert.
	 * @throws Throws if `index` is not in the range [0, `array.length`).
	 */
	insertAt(index: number, ...value: readonly (TNew | IterableTreeArrayContent<TNew>)[]): void;

	/**
	 * Inserts new item(s) at the start of the array.
	 * @param value - The content to insert.
	 */
	insertAtStart(...value: readonly (TNew | IterableTreeArrayContent<TNew>)[]): void;

	/**
	 * Inserts new item(s) at the end of the array.
	 * @param value - The content to insert.
	 */
	insertAtEnd(...value: readonly (TNew | IterableTreeArrayContent<TNew>)[]): void;

	/**
	 * Removes the item at the specified location.
	 * @param index - The index at which to remove the item.
	 * @throws Throws if `index` is not in the range [0, `array.length`).
	 */
	removeAt(index: number): void;

	/**
	 * Removes all items between the specified indices.
	 * @param start - The starting index of the range to remove (inclusive). Defaults to the start of the array.
	 * @param end - The ending index of the range to remove (exclusive). Defaults to `array.length`.
	 * @throws Throws if `start` is not in the range [0, `array.length`].
	 * @throws Throws if `end` is less than `start`.
	 * If `end` is not supplied or is greater than the length of the array, all items after `start` are removed.
	 *
	 * @remarks
	 * The default values for start and end are computed when this is called,
	 * and thus the behavior is the same as providing them explicitly, even with respect to merge resolution with concurrent edits.
	 * For example, two concurrent transactions both emptying the array with `node.removeRange()` then inserting an item,
	 * will merge to result in the array having both inserted items.
	 */
	removeRange(start?: number, end?: number): void;

	/**
	 * Moves the specified item to the start of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToStart(sourceIndex: number): void;

	/**
	 * Moves the specified item to the start of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToStart(sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified item to the end of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToEnd(sourceIndex: number): void;

	/**
	 * Moves the specified item to the end of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToEnd(sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified item to the desired location in the array.
	 * @param index - The index to move the item to.
	 * This is based on the state of the array before moving the source item.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if any of the input indices are not in the range [0, `array.length`).
	 */
	moveToIndex(index: number, sourceIndex: number): void;

	/**
	 * Moves the specified item to the desired location in the array.
	 * @param index - The index to move the item to.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if any of the input indices are not in the range [0, `array.length`).
	 */
	moveToIndex(index: number, sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the start of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the start of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the end of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the end of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the desired location within the array.
	 * @param index - The index to move the items to.
	 * This is based on the state of the array before moving the source items.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(index: number, sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the desired location within the array.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if any of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: TMoveFrom,
	): void;
}

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the array mutation APIs.
 *
 * @typeParam TAllowedTypes - Schema for types which are allowed as members of this array.
 *
 * @public
 */
export interface TreeArrayNode<TAllowedTypes extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends TreeArrayNodeBase<
		TreeNodeFromImplicitAllowedTypes<TAllowedTypes>,
		InsertableTreeNodeFromImplicitAllowedTypes<TAllowedTypes>,
		TreeArrayNode
	> {}

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the array mutation APIs.
 * @public
 */
export const TreeArrayNode = {
	/**
	 * Wrap an iterable of items to inserted as consecutive items in a array.
	 * @remarks
	 * The object returned by this function can be inserted into a {@link (TreeArrayNode:interface)}.
	 * Its contents will be inserted consecutively in the corresponding location in the array.
	 * @example
	 * ```ts
	 * array.insertAtEnd(TreeArrayNode.spread(iterable))
	 * ```
	 */
	spread: <T>(content: Iterable<T>) => create(content),
};

/**
 * Package internal construction API.
 * Use {@link (TreeArrayNode:variable).spread} to create an instance of this type instead.
 */
let create: <T>(content: Iterable<T>) => IterableTreeArrayContent<T>;

/**
 * Used to insert iterable content into a {@link (TreeArrayNode:interface)}.
 * Use {@link (TreeArrayNode:variable).spread} to create an instance of this type.
 * @public
 */
export class IterableTreeArrayContent<T> implements Iterable<T> {
	static {
		create = <T2>(content: Iterable<T2>) => new IterableTreeArrayContent(content);
	}

	private constructor(private readonly content: Iterable<T>) {}

	/**
	 * Iterates over content for nodes to insert.
	 */
	public [Symbol.iterator](): Iterator<T> {
		return this.content[Symbol.iterator]();
	}
}

/**
 * Given a array node proxy, returns its underlying LazySequence field.
 */
function getSequenceField<
	TTypes extends FlexAllowedTypes,
	TSimpleType extends ImplicitAllowedTypes,
>(arrayNode: TreeArrayNode<TSimpleType>): FlexTreeSequenceField<TTypes> {
	return getFlexNode(arrayNode).getBoxed(EmptyKey) as FlexTreeSequenceField<TTypes>;
}

// Used by 'insert*()' APIs to converts new content (expressed as a proxy union) to contextually
// typed data prior to forwarding to 'LazySequence.insert*()'.
function contextualizeInsertedArrayContent(
	content: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[],
	sequenceField: FlexTreeSequenceField<FlexAllowedTypes>,
): FactoryContent {
	return prepareContentForInsert(
		content.flatMap((c): InsertableContent[] =>
			c instanceof IterableTreeArrayContent ? Array.from(c) : [c],
		),
		sequenceField.context.checkout.forest,
	);
}

// For compatibility, we are initially implement 'readonly T[]' by applying the Array.prototype methods
// to the array node proxy.  Over time, we should replace these with efficient implementations on LazySequence
// to avoid re-entering the proxy as these methods access 'length' and the indexed properties.
//
// For brevity, the current implementation dynamically builds a property descriptor map from a list of
// Array functions we want to re-expose via the proxy.

const arrayPrototypeKeys = [
	"concat",
	"entries",
	"every",
	"filter",
	"find",
	"findIndex",
	"flat",
	"flatMap",
	"forEach",
	"includes",
	"indexOf",
	"join",
	"keys",
	"lastIndexOf",
	"map",
	"reduce",
	"reduceRight",
	"slice",
	"some",
	"toLocaleString",
	"toString",
	"values",

	// "copyWithin",
	// "fill",
	// "length",
	// "pop",
	// "push",
	// "reverse",
	// "shift",
	// "sort",
	// "splice",
	// "unshift",
] as const;

/**
 * {@link TreeNodeValid}, but modified to add members from Array.prototype named in {@link arrayPrototypeKeys}.
 * @privateRemarks
 * Since a lot of scratch types and values are involved with creating this,
 * it's generating using an immediately invoked function expression (IIFE).
 * This is a common JavaScript pattern for cases like this to avoid cluttering the scope.
 */
const TreeNodeWithArrayFeatures = (() => {
	/**
	 * {@link TreeNodeValid}, but modified to add members from Array.prototype named in {@link arrayPrototypeKeys}.
	 */
	abstract class TreeNodeWithArrayFeaturesUntyped<
		const T extends ImplicitAllowedTypes,
	> extends TreeNodeValid<Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>> {}

	// Modify TreeNodeWithArrayFeaturesUntyped to add the members from Array.prototype
	arrayPrototypeKeys.forEach((key) => {
		Object.defineProperty(TreeNodeWithArrayFeaturesUntyped.prototype, key, {
			value: Array.prototype[key],
		});
	});

	return TreeNodeWithArrayFeaturesUntyped as unknown as typeof NodeWithArrayFeatures;
})();

/**
 * Type of {@link TreeNodeValid}, but with array members added to the instance type.
 *
 * TypeScript has a rule that `Base constructors must all have the same return type.ts(2510)`.
 * This means that intersecting two types with different constructors to create a type with a more constrained constructor (ex: more specific return type)
 * is not supported.
 *
 * TypeScript also has a limitation that there is no way to replace or remove just the constructor of a type without losing all the private and protected members.
 * See https://github.com/microsoft/TypeScript/issues/35416 for details.
 *
 * TypeScript also does not support explicitly specifying the instance type in a class definition as the constructor return type.
 *
 * Thus to replace the instance type, while preserving the protected static members of TreeNodeValid,
 * the only option seems to be actually declaring a class with all the members explicitly inline.
 *
 * To avoid incurring any bundle size / runtime overhead from this and having to stub out the function bodies,
 * the class uses `declare`.
 * TypeScript does not support `declare` inside scopes, so this is not inside the function scope above.
 *
 * The members of this class were generated using the "implement interface" refactoring.
 * Since that refactoring does not add `public`, the lint to require it is disabled for this section of the file.
 * To update this class delete all members and reapply the "implement interface" refactoring.
 * As these signatures get formatted to be over three times as many lines with prettier (which is not helpful), it is also suppressed.
 */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
// prettier-ignore
declare abstract class NodeWithArrayFeatures<Input, T>
	extends TreeNodeValid<Input>
	implements Pick<readonly T[], (typeof arrayPrototypeKeys)[number]>
{
	concat(...items: ConcatArray<T>[]): T[];
	concat(...items: (T | ConcatArray<T>)[]): T[];
	entries(): IterableIterator<[number, T]>;
	every<S extends T>(predicate: (value: T, index: number, array: readonly T[]) => value is S, thisArg?: any): this is readonly S[];
	every(predicate: (value: T, index: number, array: readonly T[]) => unknown, thisArg?: any): boolean;
	filter<S extends T>(predicate: (value: T, index: number, array: readonly T[]) => value is S, thisArg?: any): S[];
	filter(predicate: (value: T, index: number, array: readonly T[]) => unknown, thisArg?: any): T[];
	find<S extends T>(predicate: (value: T, index: number, obj: readonly T[]) => value is S, thisArg?: any): S | undefined;
	find(predicate: (value: T, index: number, obj: readonly T[]) => unknown, thisArg?: any): T | undefined;
	findIndex(predicate: (value: T, index: number, obj: readonly T[]) => unknown, thisArg?: any): number;
	flat<A, D extends number = 1>(this: A, depth?: D | undefined): FlatArray<A, D>[];
	flatMap<U, This = undefined>(callback: (this: This, value: T, index: number, array: T[]) => U | readonly U[], thisArg?: This | undefined): U[];
	forEach(callbackfn: (value: T, index: number, array: readonly T[]) => void, thisArg?: any): void;
	includes(searchElement: T, fromIndex?: number | undefined): boolean;
	indexOf(searchElement: T, fromIndex?: number | undefined): number;
	join(separator?: string | undefined): string;
	keys(): IterableIterator<number>;
	lastIndexOf(searchElement: T, fromIndex?: number | undefined): number;
	map<U>(callbackfn: (value: T, index: number, array: readonly T[]) => U, thisArg?: any): U[];
	reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T): T;
	reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T, initialValue: T): T;
	reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: readonly T[]) => U, initialValue: U): U;
	reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T): T;
	reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T, initialValue: T): T;
	reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: readonly T[]) => U, initialValue: U): U;
	slice(start?: number | undefined, end?: number | undefined): T[];
	some(predicate: (value: T, index: number, array: readonly T[]) => unknown, thisArg?: any): boolean;
	toLocaleString(): string;
	toString(): string;
	values(): IterableIterator<T>;
}
/* eslint-enable @typescript-eslint/explicit-member-accessibility */

/**
 * Attempts to coerce the given property key to an integer index property.
 * @param key - The property key to coerce.
 * @param exclusiveMax - This restricts the range in which the resulting index is allowed to be.
 * The coerced index of `key` must be less than `exclusiveMax` or else this function will return `undefined`.
 * This is useful for reading an array within the bounds of its length, e.g. `asIndex(key, array.length)`.
 */
export function asIndex(key: string | symbol, exclusiveMax: number): number | undefined {
	if (typeof key !== "string") {
		return undefined;
	}

	// TODO: It may be worth a '0' <= ch <= '9' check before calling 'Number' to quickly
	// reject 'length' as an index, or even parsing integers ourselves.
	const asNumber = Number(key);
	if (!Number.isInteger(asNumber)) {
		return undefined;
	}

	// Check that the original string is the same after converting to a number and back again.
	// This prevents keys like "5.0", "0x5", " 5" from coercing to 5, and keys like " " or "" from coercing to 0.
	const asString = String(asNumber);
	if (asString !== key) {
		return undefined;
	}

	// TODO: See 'matrix/range.ts' for fast integer coercing + range check.
	return 0 <= asNumber && asNumber < exclusiveMax ? asNumber : undefined;
}

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param proxyTarget - Target object of the proxy. Must provide an own `length` value property
 * (which is not used but must exist for getOwnPropertyDescriptor invariants) and the array functionality from {@link arrayNodePrototype}.
 * Controls the prototype exposed by the produced proxy.
 * @param dispatchTarget - provides the functionally of the node, implementing all fields.
 */
function createArrayNodeProxy(
	allowAdditionalProperties: boolean,
	proxyTarget: object,
	dispatchTarget: object,
): TreeArrayNode {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an array literal in order
	// to pass 'Object.getPrototypeOf'.  It also satisfies 'Array.isArray' and 'Object.prototype.toString'
	// requirements without use of Array[Symbol.species], which is potentially on a path ot deprecation.
	const proxy: TreeArrayNode = new Proxy<TreeArrayNode>(proxyTarget as TreeArrayNode, {
		get: (target, key, receiver) => {
			const field = getSequenceField(receiver);
			const maybeIndex = asIndex(key, field.length);

			if (maybeIndex === undefined) {
				if (key === "length") {
					return field.length;
				}

				// Pass the proxy as the receiver here, so that any methods on
				// the prototype receive `proxy` as `this`.
				return Reflect.get(dispatchTarget, key, receiver) as unknown;
			}

			const value = field.boxedAt(maybeIndex);

			if (value === undefined) {
				return undefined;
			}

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getOrCreateNodeProxy(value);
		},
		set: (target, key, newValue, receiver) => {
			if (key === "length") {
				// To allow "length" to look like "length" on an array, getOwnPropertyDescriptor has to report it as a writable value.
				// This means the proxy target must provide a length value, but since it can't use getters and setters, it can't be correct.
				// Therefor length has to be handled in this proxy.
				// Since its not actually mutable, return false so setting it will produce a type error.
				return false;
			}

			// 'Symbol.isConcatSpreadable' may be set on an Array instance to modify the behavior of
			// the concat method.  We allow this property to be added to the dispatch object.
			if (key === Symbol.isConcatSpreadable) {
				return Reflect.set(dispatchTarget, key, newValue, receiver);
			}

			// Array nodes treat all non-negative integer indexes as array access.
			// Using Infinity here (rather than length) ensures that indexing past the end doesn't create additional session local properties.
			const maybeIndex = asIndex(key, Number.POSITIVE_INFINITY);
			if (maybeIndex !== undefined) {
				// For MVP, we otherwise disallow setting properties (mutation is only available via the array node mutation APIs).
				return false;
			}
			return allowAdditionalProperties ? Reflect.set(target, key, newValue) : false;
		},
		has: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			return maybeIndex !== undefined || Reflect.has(dispatchTarget, key);
		},
		ownKeys: (target) => {
			const field = getSequenceField(proxy);

			// TODO: Would a lazy iterator to produce the indexes work / be more efficient?
			// TODO: Need to surface 'Symbol.isConcatSpreadable' as an own key.
			const keys: (string | symbol)[] = Array.from(
				{ length: field.length },
				(_, index) => `${index}`,
			);

			if (allowAdditionalProperties) {
				keys.push(...Reflect.ownKeys(target));
			} else {
				keys.push("length");
			}
			return keys;
		},
		getOwnPropertyDescriptor: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			if (maybeIndex !== undefined) {
				const val = field.boxedAt(maybeIndex);
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for indexed properties must
				// be a simple value property (as opposed to using getter) and declared writable/enumerable/configurable.
				return {
					// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
					//       as simple as calling '.at' since this skips the node and returns the FieldNode's
					//       inner field.
					value: val === undefined ? val : getOrCreateNodeProxy(val),
					writable: true, // For MVP, disallow setting indexed properties.
					enumerable: true,
					configurable: true,
				};
			} else if (key === "length") {
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for 'length' must be a simple
				// value property (as opposed to using getter) and be declared writable / non-configurable.
				return {
					value: field.length,
					writable: true,
					enumerable: false,
					configurable: false,
				};
			}
			return Reflect.getOwnPropertyDescriptor(dispatchTarget, key);
		},
	});
	return proxy;
}

type Insertable<T extends ImplicitAllowedTypes> = readonly (
	| InsertableTreeNodeFromImplicitAllowedTypes<T>
	| IterableTreeArrayContent<InsertableTreeNodeFromImplicitAllowedTypes<T>>
)[];

abstract class CustomArrayNodeBase<const T extends ImplicitAllowedTypes>
	extends TreeNodeWithArrayFeatures<
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		TreeNodeFromImplicitAllowedTypes<T>
	>
	implements TreeArrayNode<T>
{
	// Indexing must be provided by subclass.
	[k: number]: TreeNodeFromImplicitAllowedTypes<T>;

	public static readonly kind = NodeKind.Array;

	protected abstract get simpleSchema(): T;

	#cursorFromFieldData(value: Insertable<T>): ITreeCursorSynchronous {
		const content = contextualizeInsertedArrayContent(
			value as readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[],
			getSequenceField(this),
		);

		// TODO: this is not valid since this is a value field schema, not a sequence one (which does not exist in the simple tree layer),
		// but it works since cursorFromFieldData special cases arrays.
		const simpleFieldSchema = normalizeFieldSchema(this.simpleSchema);

		return cursorFromFieldData(content, simpleFieldSchema);
	}

	public toJSON(): unknown {
		// This override causes the class instance to `JSON.stringify` as `[a, b]` rather than `{0: a, 1: b}`.
		return Array.from(this as unknown as TreeArrayNode);
	}

	// Instances of this class are used as the dispatch object for the proxy,
	// and thus its set of keys is used to implement `has` (for the `in` operator) for the non-numeric cases.
	// Therefore it must include `length`,
	// even though this "length" is never invoked (due to being shadowed by the proxy provided own property).
	public get length() {
		return fail("Proxy should intercept length");
	}

	public [Symbol.iterator](): IterableIterator<TreeNodeFromImplicitAllowedTypes<T>> {
		return this.values();
	}

	public get [Symbol.unscopables]() {
		// This might not be the exact right set of values, but it only matters for `with` clauses which are deprecated and are banned in strict mode, so it shouldn't matter much.
		// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/with for details.
		return Array.prototype[Symbol.unscopables];
	}

	public at(this: TreeArrayNode, index: number): TreeNode | TreeValue | undefined {
		const field = getSequenceField(this);
		const val = field.boxedAt(index);

		if (val === undefined) {
			return val;
		}

		return getOrCreateNodeProxy(val);
	}
	public insertAt(index: number, ...value: Insertable<T>): void {
		getSequenceField(this).insertAt(index, this.#cursorFromFieldData(value));
	}
	public insertAtStart(...value: Insertable<T>): void {
		getSequenceField(this).insertAtStart(this.#cursorFromFieldData(value));
	}
	public insertAtEnd(...value: Insertable<T>): void {
		getSequenceField(this).insertAtEnd(this.#cursorFromFieldData(value));
	}
	public removeAt(index: number): void {
		getSequenceField(this).removeAt(index);
	}
	public removeRange(start?: number, end?: number): void {
		const field = getSequenceField(this);
		const fieldEditor = field.sequenceEditor();
		const { length } = field;
		const removeStart = start ?? 0;
		const removeEnd = Math.min(length, end ?? length);
		validatePositiveIndex(removeStart);
		validatePositiveIndex(removeEnd);
		if (removeEnd < removeStart) {
			// This catches both the case where start is > array.length and when start is > end.
			throw new UsageError('Too large of "start" value passed to TreeArrayNode.removeRange.');
		}
		fieldEditor.remove(removeStart, removeEnd - removeStart);
	}
	public moveToStart(sourceIndex: number, source?: TreeArrayNode): void {
		if (source !== undefined) {
			getSequenceField(this).moveToStart(sourceIndex, getSequenceField(source));
		} else {
			getSequenceField(this).moveToStart(sourceIndex);
		}
	}
	public moveToEnd(sourceIndex: number, source?: TreeArrayNode): void {
		if (source !== undefined) {
			getSequenceField(this).moveToEnd(sourceIndex, getSequenceField(source));
		} else {
			getSequenceField(this).moveToEnd(sourceIndex);
		}
	}
	public moveToIndex(index: number, sourceIndex: number, source?: TreeArrayNode): void {
		if (source !== undefined) {
			getSequenceField(this).moveToIndex(index, sourceIndex, getSequenceField(source));
		} else {
			getSequenceField(this).moveToIndex(index, sourceIndex);
		}
	}
	public moveRangeToStart(sourceStart: number, sourceEnd: number, source?: TreeArrayNode): void {
		if (source !== undefined) {
			getSequenceField(this).moveRangeToStart(
				sourceStart,
				sourceEnd,
				getSequenceField(source),
			);
		} else {
			getSequenceField(this).moveRangeToStart(sourceStart, sourceEnd);
		}
	}
	public moveRangeToEnd(sourceStart: number, sourceEnd: number, source?: TreeArrayNode): void {
		if (source !== undefined) {
			getSequenceField(this).moveRangeToEnd(sourceStart, sourceEnd, getSequenceField(source));
		} else {
			getSequenceField(this).moveRangeToEnd(sourceStart, sourceEnd);
		}
	}
	public moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source?: TreeArrayNode,
	): void {
		if (source !== undefined) {
			getSequenceField(this).moveRangeToIndex(
				index,
				sourceStart,
				sourceEnd,
				getSequenceField(source),
			);
		} else {
			getSequenceField(this).moveRangeToIndex(index, sourceStart, sourceEnd);
		}
	}
}

/**
 * Define a {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
 *
 * @param name - Unique identifier for this schema including the factory's scope.
 */
export function arraySchema<
	TName extends string,
	const T extends ImplicitAllowedTypes,
	const ImplicitlyConstructable extends boolean,
>(
	identifier: TName,
	info: T,
	implicitlyConstructable: ImplicitlyConstructable,
	customizable: boolean,
): TreeNodeSchemaClass<
	TName,
	NodeKind.Array,
	TreeArrayNode<T> & WithType<TName>,
	Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
	ImplicitlyConstructable,
	T
> {
	let flexSchema: FlexFieldNodeSchema;

	// This class returns a proxy from its constructor to handle numeric indexing.
	// Alternatively it could extend a normal class which gets tons of numeric properties added.
	class schema extends CustomArrayNodeBase<T> {
		public static override prepareInstance<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			flexNode: FlexTreeNode,
		): TreeNodeValid<T2> {
			const proxyTarget = customizable ? instance : [];

			if (customizable) {
				// Since proxy reports this as a "non-configurable" property, it must exist on the underlying object used as the proxy target, not as an inherited property.
				// This should not get used as the proxy should intercept all use.
				Object.defineProperty(instance, "length", {
					value: NaN,
					writable: true,
					enumerable: false,
					configurable: false,
				});
			}
			return createArrayNodeProxy(customizable, proxyTarget, instance) as unknown as schema;
		}

		public static override buildRawNode<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			input: T2,
		): RawTreeNode<FlexTreeNodeSchema, unknown> {
			return new RawFieldNode(
				flexSchema,
				copyContent(
					flexSchema.name,
					input as Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
				) as object,
			);
		}

		protected static override constructorCached: typeof TreeNodeValid | undefined = undefined;

		protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>) {
			flexSchema = getFlexSchema(this as unknown as TreeNodeSchema) as FlexFieldNodeSchema;
		}

		public static readonly identifier = identifier;
		public static readonly info = info;
		public static readonly implicitlyConstructable: ImplicitlyConstructable =
			implicitlyConstructable;

		public get [type](): TName {
			return identifier;
		}

		protected get simpleSchema(): T {
			return info;
		}
	}

	return schema;
}

/**
 * The implementation of a field node created by {@link createRawNode}.
 */
class RawFieldNode<TSchema extends FlexFieldNodeSchema>
	extends RawTreeNode<TSchema, InsertableContent>
	implements FlexTreeFieldNode<TSchema>
{
	public get content(): FlexTreeUnboxField<TSchema["info"]> {
		throw rawError("Reading content of an array node");
	}

	public get boxedContent(): FlexTreeTypedField<TSchema["info"]> {
		throw rawError("Reading boxed content of an array node");
	}
}

function copyContent<T>(typeName: TreeNodeSchemaIdentifier, content: Iterable<T>): T[] {
	const copy = Array.from(content);
	markContentType(typeName, copy);
	return copy;
}

function validateSafeInteger(index: number): void {
	if (!Number.isSafeInteger(index)) {
		throw new UsageError(`Expected a safe integer, got ${index}.`);
	}
}

function validatePositiveIndex(index: number): void {
	validateSafeInteger(index);
	if (index < 0) {
		throw new UsageError(`Expected non-negative index, got ${index}.`);
	}
}
