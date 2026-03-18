import type { EventRepository } from "@llmbench/db";
import type { EvalEvent } from "@llmbench/types";

export class EventPersister {
	constructor(private eventRepo: EventRepository) {}

	handler(): (event: EvalEvent) => void {
		return (event) => {
			try {
				this.eventRepo.insert({
					runId: event.runId,
					eventType: event.type,
					payload: JSON.stringify(event),
					timestamp: event.timestamp,
				});
			} catch (error) {
				console.error(
					`[EventPersister] Failed to persist "${event.type}":`,
					error instanceof Error ? error.message : error,
				);
			}
		};
	}

	cleanup(runId: string): void {
		this.eventRepo.deleteByRunId(runId);
	}
}
