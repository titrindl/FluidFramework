/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import { Client } from "@fluidframework/merge-tree/internal";

import { SequencePlace, Side, normalizeSequencePlace } from "../intervalCollection.js";
import { IntervalNode, IntervalTree } from "../intervalTree.js";
import {
	IIntervalHelpers,
	ISerializableInterval,
	IntervalType,
	SequenceInterval,
	sequenceIntervalHelpers,
} from "../intervals/index.js";
import { ISharedString } from "../sharedString.js";

import { IntervalIndex } from "./intervalIndex.js";

/**
 * @alpha
 */
export interface IOverlappingIntervalsIndex<TInterval extends ISerializableInterval>
	extends IntervalIndex<TInterval> {
	/**
	 * @returns an array of all intervals contained in this collection that overlap the range
	 * `[start end]`.
	 */
	findOverlappingIntervals(start: SequencePlace, end: SequencePlace): TInterval[];

	/**
	 * Gathers the interval results based on specified parameters.
	 */
	gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: SequencePlace,
		end?: SequencePlace,
	): void;
}

export class OverlappingIntervalsIndex<TInterval extends ISerializableInterval>
	implements IOverlappingIntervalsIndex<TInterval>
{
	protected readonly intervalTree = new IntervalTree<TInterval>();
	protected readonly client: Client;
	protected readonly helpers: IIntervalHelpers<TInterval>;

	constructor(client: Client, helpers: IIntervalHelpers<TInterval>) {
		this.client = client;
		this.helpers = helpers;
	}

	public map(fn: (interval: TInterval) => void) {
		this.intervalTree.map(fn);
	}

	public mapUntil(fn: (interval: TInterval) => boolean) {
		this.intervalTree.mapUntil(fn);
	}

	public gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: SequencePlace,
		end?: SequencePlace,
	): void {
		if (this.intervalTree.intervals.isEmpty()) {
			return;
		}

		if (start === undefined && end === undefined) {
			// No start/end provided. Gather the whole tree in the specified order.
			if (iteratesForward) {
				this.intervalTree.map((interval: TInterval) => {
					results.push(interval);
				});
			} else {
				this.intervalTree.mapBackward((interval: TInterval) => {
					results.push(interval);
				});
			}
		} else {
			const transientInterval: TInterval = this.helpers.create(
				"transient",
				start ?? "start",
				end ?? "end",
				this.client,
				IntervalType.Transient,
			);

			if (start === undefined) {
				// Only end position provided. Since the tree is not sorted by end position,
				// walk the whole tree in the specified order, gathering intervals that match the end.
				if (iteratesForward) {
					this.intervalTree.map((interval: TInterval) => {
						if (transientInterval.compareEnd(interval) === 0) {
							results.push(interval);
						}
					});
				} else {
					this.intervalTree.mapBackward((interval: TInterval) => {
						if (transientInterval.compareEnd(interval) === 0) {
							results.push(interval);
						}
					});
				}
			} else {
				// Start and (possibly) end provided. Walk the subtrees that may contain
				// this start position.
				const compareFn =
					end === undefined
						? (node: IntervalNode<TInterval>) => {
								return transientInterval.compareStart(node.key);
							}
						: (node: IntervalNode<TInterval>) => {
								return transientInterval.compare(node.key);
							};
				const continueLeftFn = (cmpResult: number) => cmpResult <= 0;
				const continueRightFn = (cmpResult: number) => cmpResult >= 0;
				const actionFn = (node: IntervalNode<TInterval>) => {
					results.push(node.key);
				};

				if (iteratesForward) {
					this.intervalTree.intervals.walkExactMatchesForward(
						compareFn,
						actionFn,
						continueLeftFn,
						continueRightFn,
					);
				} else {
					this.intervalTree.intervals.walkExactMatchesBackward(
						compareFn,
						actionFn,
						continueLeftFn,
						continueRightFn,
					);
				}
			}
		}
	}

	public findOverlappingIntervals(start: SequencePlace, end: SequencePlace): TInterval[] {
		const { pos: startPos, side: startSide } = normalizeSequencePlace(start);
		const { pos: endPos, side: endSide } = normalizeSequencePlace(end);

		const invertedSearchInterval =
			(startPos !== -1 && endPos !== -1 && endPos < startPos) ||
			(startPos === -1 && // start is the end of the sequence, but end is somewhere earlier
				startSide === Side.Before &&
				!(endPos === -1 && endSide === Side.Before)) ||
			(endPos === -1 && // end is the start of the sequence, but start is somewhere later
				endSide === Side.After &&
				!(startPos === -1 && startSide === Side.After));
		if (invertedSearchInterval || this.intervalTree.intervals.isEmpty()) {
			return [];
		}
		const transientInterval = this.helpers.create(
			"transient",
			start,
			end,
			this.client,
			IntervalType.Transient,
			undefined,
			undefined,
			true,
		);

		const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
		return overlappingIntervalNodes.map((node) => node.key);
	}

	public remove(interval: TInterval) {
		this.intervalTree.removeExisting(interval);
	}

	public add(interval: TInterval) {
		this.intervalTree.put(interval);
	}
}

/**
 * @alpha
 */
export function createOverlappingIntervalsIndex(
	sharedString: ISharedString,
): IOverlappingIntervalsIndex<SequenceInterval> {
	const client = (sharedString as unknown as { client: Client }).client;
	return new OverlappingIntervalsIndex<SequenceInterval>(client, sequenceIntervalHelpers);
}
