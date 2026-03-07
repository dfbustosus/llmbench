export class RetryHandler {
	private maxDelayMs: number;

	constructor(
		private maxRetries: number,
		private baseDelayMs: number = 1000,
		maxDelayMs: number = 30000,
	) {
		this.maxDelayMs = maxDelayMs;
	}

	async execute<T>(fn: () => Promise<T>): Promise<T> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < this.maxRetries) {
					const delay = Math.min(this.baseDelayMs * 2 ** attempt, this.maxDelayMs);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		throw lastError;
	}
}
