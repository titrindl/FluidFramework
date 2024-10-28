/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type {
	IDirectory,
	ISharedDirectory,
	ISharedDirectoryEvents,
} from "@fluidframework/map/internal";
import type {
	IExperimentalIncrementalSummaryContext,
	ITelemetryContext,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import {
	createSharedObjectKind,
	SharedObject,
	type IFluidSerializer,
} from "@fluidframework/shared-object-base/internal";
import path from "path-browserify";

const posix = path.posix;

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link ISharedDirectory}.
 *
 * @sealed
 * @legacy
 * @alpha
 */
export class DirectoryTreeFactory implements IChannelFactory<ISharedDirectory> {
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public static readonly Type = "https://graph.microsoft.com/types/directory";

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: DirectoryTreeFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: "0.0.0",
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return DirectoryTreeFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return DirectoryTreeFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedDirectory> {
		const directory = new SharedDirectoryTreeInternal(id, runtime, attributes);
		await directory.load(services);

		return directory;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedDirectory {
		const directory = new SharedDirectoryTreeInternal(
			id,
			runtime,
			DirectoryTreeFactory.Attributes,
		);
		directory.initializeLocal();

		return directory;
	}
}

class SharedDirectoryTreeInternal
	extends SharedObject<ISharedDirectoryEvents>
	implements ISharedDirectory
{
	private tree: SharedTree;
	constructor(
		public id: string,
		public readonly runtime: IFluidDataStoreRuntime,
		public attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "SharedDirectoryTree");
	}

	public absolutePath: string = posix.sep;
	public get size(): number {
		throw new Error("Method not implemented.");
	}

	public [Symbol.iterator](): IterableIterator<[string, any]> {
		throw new Error("Method not implemented.");
	}
	public readonly [Symbol.toStringTag]: string = "SharedDirectory";

	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): ISummaryTreeWithStats {
		throw new Error("Method not implemented.");
	}
	protected async loadCore(services: IChannelStorageService): Promise<void> {
		throw new Error("Method not implemented.");
	}
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		throw new Error("Method not implemented.");
	}
	protected onDisconnect() {
		throw new Error("Method not implemented.");
	}
	protected applyStashedOp(content: any): void {
		throw new Error("Method not implemented.");
	}
	dispose?(error?: Error): void {
		throw new Error("Method not implemented.");
	}
	get<T = any>(key: string): T | undefined {
		throw new Error("Method not implemented.");
	}
	set<T = unknown>(key: string, value: T): IDirectory {
		throw new Error("Method not implemented.");
	}
	countSubDirectory?(): number {
		throw new Error("Method not implemented.");
	}
	createSubDirectory(subdirName: string): IDirectory {
		throw new Error("Method not implemented.");
	}
	getSubDirectory(subdirName: string): IDirectory | undefined {
		throw new Error("Method not implemented.");
	}
	hasSubDirectory(subdirName: string): boolean {
		throw new Error("Method not implemented.");
	}
	deleteSubDirectory(subdirName: string): boolean {
		throw new Error("Method not implemented.");
	}
	subdirectories(): IterableIterator<[string, IDirectory]> {
		throw new Error("Method not implemented.");
	}
	getWorkingDirectory(relativePath: string): IDirectory | undefined {
		throw new Error("Method not implemented.");
	}
	clear(): void {
		throw new Error("Method not implemented.");
	}
	delete(key: string): boolean {
		throw new Error("Method not implemented.");
	}
	forEach(
		callbackfn: (value: any, key: string, map: Map<string, any>) => void,
		thisArg?: any,
	): void {
		throw new Error("Method not implemented.");
	}
	has(key: string): boolean {
		throw new Error("Method not implemented.");
	}
	entries(): MapIterator<[string, any]> {
		throw new Error("Method not implemented.");
	}
	keys(): MapIterator<string> {
		throw new Error("Method not implemented.");
	}
	values(): MapIterator<any> {
		throw new Error("Method not implemented.");
	}
}

/**
 * Entrypoint for {@link ISharedDirectory} creation.
 * @legacy
 * @alpha
 */
export const SharedDirectory = createSharedObjectKind<ISharedDirectory>(DirectoryTreeFactory);

/**
 * Entrypoint for {@link ISharedDirectory} creation.
 * @legacy
 * @alpha
 * @privateRemarks
 * This alias is for legacy compat from when the SharedDirectory class was exported as public.
 */
export type SharedDirectory = ISharedDirectory;
