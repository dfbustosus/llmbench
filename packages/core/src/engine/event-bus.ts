import type { EvalEvent } from "@llmbench/types";

type EventHandler = (event: EvalEvent) => void;

export class EventBus {
	private handlers: EventHandler[] = [];

	on(handler: EventHandler): () => void {
		this.handlers.push(handler);
		return () => {
			this.handlers = this.handlers.filter((h) => h !== handler);
		};
	}

	emit(event: EvalEvent): void {
		for (const handler of this.handlers) {
			try {
				handler(event);
			} catch (error) {
				console.error(
					`[EventBus] Handler threw during "${event.type}" event:`,
					error instanceof Error ? error.message : error,
				);
			}
		}
	}
}
