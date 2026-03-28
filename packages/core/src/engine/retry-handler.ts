import {
	CancellationError,
	ConfigError,
	ProviderError,
	ScorerError,
	TimeoutError,
} from "@llmbench/types";

export class RetryHandler {
	private maxDelayMs: number;

	constructor(
		private maxRetries: number,
		private baseDelayMs: number = 1000,
		maxDelayMs: number = 30000,
	) {
		this.maxDelayMs = maxDelayMs;
	}

	async execute<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			if (signal?.aborted) {
				throw new CancellationError();
			}

			try {
				return await fn();
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// Bail immediately for non-retryable errors
				if (!this.shouldRetry(lastError)) {
					throw lastError;
				}

				if (attempt < this.maxRetries) {
					const delay = Math.min(this.baseDelayMs * 2 ** attempt, this.maxDelayMs);
					await this.abortableDelay(delay, signal);
				}
			}
		}

		throw lastError;
	}

	private shouldRetry(error: Error): boolean {
		if (error instanceof CancellationError) return false;
		if (error instanceof ConfigError) return false;
		if (error instanceof ScorerError) return false;
		if (error instanceof ProviderError) return error.isRetryable;
		if (error instanceof TimeoutError) return true;

		// Unknown errors: retry for backward compatibility
		return true;
	}

	private abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
		if (signal?.aborted) {
			return Promise.reject(new CancellationError());
		}

		return new Promise<void>((resolve, reject) => {
			const onAbort = () => {
				clearTimeout(timer);
				reject(new CancellationError());
			};

			const timer = setTimeout(() => {
				signal?.removeEventListener("abort", onAbort);
				resolve();
			}, ms);

			signal?.addEventListener("abort", onAbort, { once: true });
		});
	}
}
