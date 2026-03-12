export interface Dataset {
	id: string;
	projectId: string;
	name: string;
	description?: string;
	version: number;
	contentHash?: string;
	createdAt: string;
	updatedAt: string;
}

export interface TestCase {
	id: string;
	datasetId: string;
	input: string;
	expected: string;
	messages?: import("./provider.js").ChatMessage[];
	context?: Record<string, unknown>;
	tags?: string[];
	orderIndex: number;
}
