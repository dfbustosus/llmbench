export interface CIGateConfig {
	/** Minimum average score threshold (0-1). Fails if overall average is below this. */
	minScore?: number;
	/** Maximum allowed failure rate (0-1). E.g., 0.1 means max 10% failures. */
	maxFailureRate?: number;
	/** Maximum total cost in USD. */
	maxCost?: number;
	/** Maximum average latency in milliseconds. */
	maxLatencyMs?: number;
	/** Per-scorer minimum score thresholds. Key is scorer name, value is minimum (0-1). */
	scorerThresholds?: Record<string, number>;
}

export interface GateResult {
	passed: boolean;
	violations: GateViolation[];
}

export interface GateViolation {
	/** Identifier for the gate that was violated. */
	gate: string;
	/** Configured threshold value. */
	threshold: number;
	/** Actual measured value. */
	actual: number;
	/** Human-readable description of the violation. */
	message: string;
}
