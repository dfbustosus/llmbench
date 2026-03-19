import { CancellationError } from "@llmbench/types";

export class ConcurrencyManager {
	private running = 0;
	private queue: Array<() => void> = [];

	constructor(private maxConcurrency: number) {}

	async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
		if (signal?.aborted) {
			throw new CancellationError();
		}

		if (this.running >= this.maxConcurrency) {
			await new Promise<void>((resolve, reject) => {
				if (!signal) {
					this.queue.push(resolve);
					return;
				}

				const onAbort = () => {
					const idx = this.queue.indexOf(entry);
					if (idx !== -1) {
						this.queue.splice(idx, 1);
					}
					reject(new CancellationError());
				};

				const entry = () => {
					signal.removeEventListener("abort", onAbort);
					resolve();
				};

				signal.addEventListener("abort", onAbort, { once: true });
				this.queue.push(entry);
			});
		}

		this.running++;
		try {
			return await fn();
		} finally {
			this.running--;
			const next = this.queue.shift();
			if (next) next();
		}
	}
}
