export interface Dataset {
	id: string;
	projectId: string;
	name: string;
	description?: string;
	version: number;
	createdAt: string;
	updatedAt: string;
}

export interface TestCase {
	id: string;
	datasetId: string;
	input: string;
	expected: string;
	context?: Record<string, unknown>;
	tags?: string[];
	orderIndex: number;
}
