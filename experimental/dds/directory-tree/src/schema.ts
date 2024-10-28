import { SharedTree, SchemaFactory, TreeViewConfiguration } from "fluid-framework";

const sf = new SchemaFactory("DirectoryTree");

class SubDirectoryMap extends sf.mapRecursive("subdirectories", [() => SubDirectory]) {}

export class SubDirectory extends sf.objectRecursive("SubDirectory", {
	absolutePath: sf.string,
	deleted: sf.boolean,
	subdirectories: SubDirectoryMap,
}) {
	public deleteSubdirectory(subdirName: string) {
		this.subdirectories.delete(subdirName);
	}

	public createSubdirectory(subdirName: string) {
		this.subdirectories.set(
			subdirName,
			new SubDirectory({
				absolutePath: `${this.absolutePath}/${subdirName}`,
				deleted: false,
				subdirectories: new SubDirectoryMap([]),
			}),
		);
	}
}

export const diurectoryTreeViewConfiguration = new TreeViewConfiguration({
	schema: SubDirectory,
});
