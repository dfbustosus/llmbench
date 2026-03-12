export type EvalEvent =
	| RunStartedEvent
	| CaseStartedEvent
	| CaseCompletedEvent
	| CaseFailedEvent
	| RunProgressEvent
	| RunCompletedEvent
	| RunFailedEvent;

export interface RunStartedEvent {
	type: "run:started";
	runId: string;
	totalCases: number;
	timestamp: string;
}

export interface CaseStartedEvent {
	type: "case:started";
	runId: string;
	testCaseId: string;
	providerId: string;
	timestamp: string;
}

export interface CaseCompletedEvent {
	type: "case:completed";
	runId: string;
	testCaseId: string;
	providerId: string;
	latencyMs: number;
	cached?: boolean;
	scores: Array<{ scorerName: string; value: number }>;
	timestamp: string;
}

export interface CaseFailedEvent {
	type: "case:failed";
	runId: string;
	testCaseId: string;
	providerId: string;
	error: string;
	timestamp: string;
}

export interface RunProgressEvent {
	type: "run:progress";
	runId: string;
	completedCases: number;
	totalCases: number;
	failedCases: number;
	timestamp: string;
}

export interface RunCompletedEvent {
	type: "run:completed";
	runId: string;
	totalCases: number;
	failedCases: number;
	avgScore: number;
	totalCost: number;
	timestamp: string;
}

export interface RunFailedEvent {
	type: "run:failed";
	runId: string;
	error: string;
	timestamp: string;
}
