/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	EmptyKey,
	type FieldKey,
	type MapTree,
	type TreeValue,
	ValueSchema,
} from "../core/index.js";
import {
	type CursorWithNode,
	cursorForMapTreeField,
	cursorForMapTreeNode,
	isTreeValue,
	typeNameSymbol,
	valueSchemaAllows,
} from "../feature-libraries/index.js";
import { brand, fail, isReadonlyArray } from "../util/index.js";

import { nullSchema } from "./leafNodeSchema.js";
import { InsertableContent } from "./proxies.js";
import {
	FieldKind,
	FieldSchema,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
	NodeKind,
	type TreeNodeSchema,
	normalizeAllowedTypes,
	normalizeFieldSchema,
	getStoredKey,
} from "./schemaTypes.js";

/**
 * Module notes:
 *
 * The flow of the below code is in terms of the structure of the input data. We then verify that the associated
 * schema is appropriate for that kind of data. This is fine while we have a 1:1 mapping of kind of input data to
 * the kind of schema we expect for it (e.g. an input that is an array always need to be associated with a sequence in
 * the schema). If/when we begin accepting kinds of input data that are ambiguous (e.g. accepting an input that is an
 * array of key/value tuples to instantiate a map) we may need to rethink the structure here to be based more on the
 * schema than on the input data.
 */

/**
 * Transforms an input {@link TypedNode} tree to a {@link MapTree}, and wraps the tree in a {@link CursorWithNode}.
 * @param data - The input tree to be converted.
 * @param allowedTypes - The set of types allowed by the parent context. Used to validate the input tree.
 *
 * @returns A cursor (in nodes mode) for the mapped tree if the input data was defined. Otherwise, returns `undefined`.
 */
export function cursorFromNodeData(
	data: InsertableContent,
	allowedTypes: ImplicitAllowedTypes,
): CursorWithNode<MapTree> | undefined {
	if (data === undefined) {
		return undefined;
	}
	const mappedContent = nodeDataToMapTree(data, normalizeAllowedTypes(allowedTypes));
	return cursorForMapTreeNode(mappedContent);
}

/**
 * Transforms an input {@link InsertableContent} tree to an array of {@link MapTree}s, and wraps the tree in a {@link CursorWithNode}.
 * @param data - The input tree to be converted.
 * @param schema - Schema of the field with which the input `data` is associated.
 */
export function cursorFromFieldData(
	data: InsertableContent,
	schema: FieldSchema,
): CursorWithNode<MapTree> {
	// TODO: array node content should not go through here since sequence fields don't exist at this abstraction layer.
	const mappedContent = Array.isArray(data)
		? arrayToMapTreeFields(data, schema.allowedTypeSet)
		: [nodeDataToMapTree(data, schema.allowedTypeSet)];
	return cursorForMapTreeField(mappedContent);
}

/**
 * Transforms an input {@link TypedNode} tree to a {@link MapTree}.
 * @param data - The input tree to be converted.
 * If the data is an unsupported value (e.g. NaN), a fallback value will be used when supported,
 * otherwise an error will be thrown.
 *
 * Fallbacks:
 *
 * * `NaN` =\> `null`
 *
 * * `+/-∞` =\> `null`
 *
 * * `-0` =\> `+0`
 *
 * @param data - The tree data being transformed.
 * @param allowedTypes - The set of types allowed by the parent context. Used to validate the input tree.
 */
export function nodeDataToMapTree(
	data: InsertableContent,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): MapTree {
	assert(data !== undefined, 0x846 /* Cannot map undefined tree. */);

	const schema = getType(data, allowedTypes);

	switch (schema.kind) {
		case NodeKind.Leaf:
			return leafToMapTree(data, schema, allowedTypes);
		case NodeKind.Array:
			return arrayToMapTree(data, schema);
		case NodeKind.Map:
			return mapToMapTree(data, schema);
		case NodeKind.Object:
			return objectToMapTree(data, schema);
		default:
			fail(`Unrecognized schema kind: ${schema.kind}.`);
	}
}

/**
 * Transforms data under a Leaf schema.
 * @param data - The tree data to be transformed. Must be a {@link TreeValue}.
 * @param schema - The schema associated with the value.
 * @param allowedTypes - The allowed types specified by the parent.
 * Used to determine which fallback values may be appropriate.
 */
function leafToMapTree(
	data: InsertableContent,
	schema: TreeNodeSchema,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): MapTree {
	assert(schema.kind === NodeKind.Leaf, 0x921 /* Expected a leaf schema. */);
	if (!isTreeValue(data)) {
		// This rule exists to protect against useless `toString` output like `[object Object]`.
		// In this case, that's actually reasonable behavior, since object input is not compatible with Leaf schemas.
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		throw new UsageError(`Input data is incompatible with leaf schema: ${data}`);
	}

	const mappedValue = mapValueWithFallbacks(data, allowedTypes);
	const mappedSchema = getType(mappedValue, allowedTypes);

	assert(
		allowsValue(mappedSchema, mappedValue),
		0x84a /* Unsupported schema for provided primitive. */,
	);

	return {
		value: mappedValue,
		type: brand(mappedSchema.identifier),
		fields: new Map(),
	};
}

/**
 * Checks an incoming value to ensure it is compatible with our serialization format.
 * For unsupported values with a schema-compatible replacement, return the replacement value.
 * For unsupported values without a schema-compatible replacement, throw.
 * For supported values, return the input.
 */
function mapValueWithFallbacks(
	value: TreeValue,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): TreeValue {
	switch (typeof value) {
		case "number": {
			if (Object.is(value, -0)) {
				// Our serialized data format does not support -0.
				// Map such input to +0.
				return 0;
			} else if (Number.isNaN(value) || !Number.isFinite(value)) {
				// Our serialized data format does not support NaN nor +/-∞.
				// If the schema supports `null`, fall back to that. Otherwise, throw.
				// This is intended to match JSON's behavior for such values.
				if (allowedTypes.has(nullSchema)) {
					return null;
				} else {
					throw new TypeError(`Received unsupported numeric value: ${value}.`);
				}
			} else {
				return value;
			}
		}
		default:
			return value;
	}
}

function arrayToMapTreeFields(
	data: readonly InsertableContent[],
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): MapTree[] {
	const mappedData: MapTree[] = [];
	for (const child of data) {
		// We do not support undefined sequence entries.
		// If we encounter an undefined entry, use null instead if supported by the schema, otherwise throw.
		let childWithFallback = child;
		if (child === undefined) {
			if (allowedTypes.has(nullSchema)) {
				childWithFallback = null;
			} else {
				throw new TypeError(`Received unsupported array entry value: ${child}.`);
			}
		}
		const mappedChild = nodeDataToMapTree(childWithFallback, allowedTypes);
		mappedData.push(mappedChild);
	}

	return mappedData;
}

/**
 * Transforms data under an Array schema.
 * @param data - The tree data to be transformed. Must be an array.
 * @param schema - The schema associated with the value.
 * @param allowedTypes - The allowed types specified by the parent.
 * Used to determine which fallback values may be appropriate.
 */
function arrayToMapTree(data: InsertableContent, schema: TreeNodeSchema): MapTree {
	assert(schema.kind === NodeKind.Array, 0x922 /* Expected an array schema. */);
	if (!isReadonlyArray(data)) {
		throw new UsageError(`Input data is incompatible with Array schema: ${data}`);
	}

	const allowedChildTypes = normalizeAllowedTypes(schema.info as ImplicitAllowedTypes);

	const mappedData = arrayToMapTreeFields(data, allowedChildTypes);

	// Array node children are represented as a single field entry denoted with `EmptyKey`
	const fieldsEntries: [FieldKey, MapTree[]][] =
		mappedData.length === 0 ? [] : [[EmptyKey, mappedData]];
	const fields = new Map<FieldKey, MapTree[]>(fieldsEntries);

	return {
		type: brand(schema.identifier),
		fields,
	};
}

/**
 * Transforms data under a Map schema.
 * @param data - The tree data to be transformed. Must be a TypeScript Map.
 * @param schema - The schema associated with the value.
 * @param allowedTypes - The allowed types specified by the parent.
 * Used to determine which fallback values may be appropriate.
 */
function mapToMapTree(data: InsertableContent, schema: TreeNodeSchema): MapTree {
	assert(schema.kind === NodeKind.Map, 0x923 /* Expected a Map schema. */);
	if (!(data instanceof Map)) {
		throw new UsageError(`Input data is incompatible with Map schema: ${data}`);
	}

	const allowedChildTypes = normalizeAllowedTypes(schema.info as ImplicitAllowedTypes);

	const transformedFields = new Map<FieldKey, MapTree[]>();
	for (const [key, value] of data) {
		assert(!transformedFields.has(brand(key)), 0x84c /* Keys should not be duplicated */);

		// Omit undefined values - an entry with an undefined value is equivalent to one that has been removed or omitted
		if (value !== undefined) {
			const mappedField = nodeDataToMapTree(value, allowedChildTypes);
			transformedFields.set(brand(key), [mappedField]);
		}
	}

	return {
		type: brand(schema.identifier),
		fields: transformedFields,
	};
}

/**
 * Transforms data under an Object schema.
 * @param data - The tree data to be transformed. Must be a Record-like object.
 * @param schema - The schema associated with the value.
 * @param allowedTypes - The allowed types specified by the parent.
 * Used to determine which fallback values may be appropriate.
 */
function objectToMapTree(data: InsertableContent, schema: TreeNodeSchema): MapTree {
	assert(schema.kind === NodeKind.Object, 0x924 /* Expected an Object schema. */);
	if (typeof data !== "object" || data === null) {
		throw new UsageError(`Input data is incompatible with Object schema: ${data}`);
	}

	const fields = new Map<FieldKey, MapTree[]>();

	// Filter keys to only those that are strings - our trees do not support symbol or numeric property keys
	const keys = Reflect.ownKeys(data).filter((key) => typeof key === "string") as FieldKey[];

	for (const viewKey of keys) {
		const fieldValue = (data as Record<FieldKey, InsertableContent>)[viewKey];

		// Omit undefined record entries - an entry with an undefined key is equivalent to no entry
		if (fieldValue !== undefined) {
			const fieldSchema = getObjectFieldSchema(schema, viewKey);
			const mappedChildTree = nodeDataToMapTree(fieldValue, fieldSchema.allowedTypeSet);
			const flexKey: FieldKey = brand(getStoredKey(viewKey, fieldSchema));

			// Note: SchemaFactory validates this at schema creation time, with a user-friendly error.
			// So we don't expect to hit this, and if we do it is likely an internal bug.
			assert(!fields.has(flexKey), 0x925 /* Keys must not be duplicated */);
			fields.set(flexKey, [mappedChildTree]);
		}
	}

	return {
		type: brand(schema.identifier),
		fields,
	};
}

function getObjectFieldSchema(schema: TreeNodeSchema, key: FieldKey): FieldSchema {
	assert(schema.kind === NodeKind.Object, 0x926 /* Expected an Object schema. */);
	const fields = schema.info as Record<string, ImplicitFieldSchema>;
	if (fields[key] === undefined) {
		fail(`Field "${key}" not found in schema "${schema.identifier}".`);
	} else {
		return normalizeFieldSchema(fields[key]);
	}
}

function getType(
	data: InsertableContent,
	allowedTypes: ReadonlySet<TreeNodeSchema>,
): TreeNodeSchema {
	const possibleTypes = getPossibleTypes(allowedTypes, data as ContextuallyTypedNodeData);
	if (possibleTypes.length === 0) {
		throw new UsageError(
			`The provided data is incompatible with all of the types allowed by the schema. The set of allowed types is: ${JSON.stringify(
				[...allowedTypes].map((schema) => schema.identifier),
			)}.`,
		);
	}
	assert(
		possibleTypes.length !== 0,
		0x84e /* data is incompatible with all types allowed by the schema */,
	);
	checkInput(
		possibleTypes.length === 1,
		() =>
			`The provided data is compatible with more than one type allowed by the schema.
The set of possible types is ${JSON.stringify([
				...possibleTypes.map((schema) => schema.identifier),
			])}.
Explicitly construct an unhydrated node of the desired type to disambiguate.
For class-based schema, this can be done by replacing an expression like "{foo: 1}" with "new MySchema({foo: 1})".`,
	);
	return possibleTypes[0];
}

/**
 * An invalid tree has been provided, presumably by the user of this package.
 * Throw and an error that properly preserves the message (unlike asserts which will get hard to read short codes intended for package internal logic errors).
 */
function invalidInput(message: string): never {
	throw new UsageError(message);
}

function checkInput(condition: boolean, message: string | (() => string)): asserts condition {
	if (!condition) {
		invalidInput(typeof message === "string" ? message : message());
	}
}

/**
 * @returns all types for which the data is schema-compatible.
 */
export function getPossibleTypes(
	allowedTypes: ReadonlySet<TreeNodeSchema>,
	data: ContextuallyTypedNodeData,
) {
	const possibleTypes: TreeNodeSchema[] = [];
	for (const schema of allowedTypes) {
		if (shallowCompatibilityTest(schema, data)) {
			possibleTypes.push(schema);
		}
	}
	return possibleTypes;
}

/**
 * Checks if data might be schema-compatible.
 *
 * @returns false if `data` is incompatible with `type` based on a cheap/shallow check.
 *
 * Note that this may return true for cases where data is incompatible, but it must not return false in cases where the data is compatible.
 */
function shallowCompatibilityTest(
	schema: TreeNodeSchema,
	data: ContextuallyTypedNodeData,
): boolean {
	assert(
		data !== undefined,
		0x889 /* undefined cannot be used as contextually typed data. Use ContextuallyTypedFieldData. */,
	);

	if (isTreeValue(data)) {
		return allowsValue(schema, data);
	}
	if (schema.kind === NodeKind.Leaf) {
		return false;
	}

	if (typeNameSymbol in data) {
		return data[typeNameSymbol] === schema.identifier;
	}

	if (isReadonlyArray(data)) {
		return schema.kind === NodeKind.Array;
	}
	if (schema.kind === NodeKind.Array) {
		return false;
	}

	if (data instanceof Map) {
		return schema.kind === NodeKind.Map;
	}
	if (schema.kind === NodeKind.Map) {
		return false;
	}

	// Assume record-like object
	if (schema.kind !== NodeKind.Object) {
		return false;
	}

	const fields = schema.info as Record<string, ImplicitFieldSchema>;

	// TODO: Improve type inference by making this logic more thorough. Handle at least:
	// * Types which are strict subsets of other types in the same polymorphic union
	// * Types which have the same keys but different types for those keys in the polymorphic union
	// * Types which have the same required fields but different optional fields and enough of those optional fields are populated to disambiguate

	// TODO#7441: Consider allowing data to be inserted which has keys that are extraneous/unknown to the schema (those keys are ignored)

	// If the schema has a required key which is not present in the input object, reject it.
	for (const [fieldKey, fieldSchema] of Object.entries(fields)) {
		const normalizedFieldSchema = normalizeFieldSchema(fieldSchema);
		if (data[fieldKey] === undefined && normalizedFieldSchema.kind === FieldKind.Required) {
			return false;
		}
	}

	return true;
}

function allowsValue(schema: TreeNodeSchema, value: TreeValue): boolean {
	if (schema.kind === NodeKind.Leaf) {
		return valueSchemaAllows(schema.info as ValueSchema, value);
	}
	return false;
}

/**
 * Content of a tree which needs external schema information to interpret.
 *
 * This format is intended for concise authoring of tree literals when the schema is statically known.
 *
 * Once schema aware APIs are implemented, they can be used to provide schema specific subsets of this type.
 */
export type ContextuallyTypedNodeData =
	| ContextuallyTypedNodeDataObject
	| number
	| string
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| readonly ContextuallyTypedNodeData[];

/**
 * Content of a field which needs external schema information to interpret.
 *
 * This format is intended for concise authoring of tree literals when the schema is statically known.
 *
 * Once schema aware APIs are implemented, they can be used to provide schema specific subsets of this type.
 */
export type ContextuallyTypedFieldData = ContextuallyTypedNodeData | undefined;

/**
 * Object case of {@link ContextuallyTypedNodeData}.
 */
export interface ContextuallyTypedNodeDataObject {
	/**
	 * The type of the node.
	 * If this node is well-formed, it must follow this schema.
	 */
	readonly [typeNameSymbol]?: string;

	/**
	 * Fields of this node, indexed by their field keys.
	 *
	 * Allow explicit undefined for compatibility with FlexTree, and type-safety on read.
	 */
	// TODO: make sure explicit undefined is actually handled correctly.
	[key: FieldKey]: ContextuallyTypedFieldData;

	/**
	 * Fields of this node, indexed by their field keys as strings.
	 *
	 * Allow unbranded field keys as a convenience for literals.
	 */
	[key: string]: ContextuallyTypedFieldData;
}
