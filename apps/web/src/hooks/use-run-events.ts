"use client";

import { useEffect, useRef, useState } from "react";

interface RunEventState {
	isLive: boolean;
	completedCases: number;
	totalCases: number;
	failedCases: number;
	latestEventType: string | null;
}

const INITIAL_STATE: RunEventState = {
	isLive: false,
	completedCases: 0,
	totalCases: 0,
	failedCases: 0,
	latestEventType: null,
};

export function useRunEvents(runId: string, enabled: boolean): RunEventState {
	const [state, setState] = useState<RunEventState>(INITIAL_STATE);
	const sourceRef = useRef<EventSource | null>(null);

	useEffect(() => {
		if (!enabled) {
			setState(INITIAL_STATE);
			return;
		}

		const es = new EventSource(`/api/events/${runId}`);
		sourceRef.current = es;

		es.addEventListener("run:started", (e) => {
			const data = JSON.parse(e.data);
			setState((prev) => ({
				...prev,
				isLive: true,
				totalCases: data.totalCases,
				latestEventType: "run:started",
			}));
		});

		es.addEventListener("run:progress", (e) => {
			const data = JSON.parse(e.data);
			setState((prev) => ({
				...prev,
				isLive: true,
				completedCases: data.completedCases,
				totalCases: data.totalCases,
				failedCases: data.failedCases,
				latestEventType: "run:progress",
			}));
		});

		es.addEventListener("case:completed", () => {
			setState((prev) => ({
				...prev,
				isLive: true,
				latestEventType: "case:completed",
			}));
		});

		es.addEventListener("case:failed", () => {
			setState((prev) => ({
				...prev,
				isLive: true,
				latestEventType: "case:failed",
			}));
		});

		es.addEventListener("run:completed", () => {
			setState((prev) => ({
				...prev,
				isLive: false,
				latestEventType: "run:completed",
			}));
		});

		es.addEventListener("run:failed", () => {
			setState((prev) => ({
				...prev,
				isLive: false,
				latestEventType: "run:failed",
			}));
		});

		es.addEventListener("rescore:completed", () => {
			setState((prev) => ({
				...prev,
				isLive: false,
				latestEventType: "rescore:completed",
			}));
		});

		es.addEventListener("stream:end", () => {
			setState((prev) => ({ ...prev, isLive: false }));
			es.close();
		});

		es.onerror = () => {
			// Permanent failure — EventSource will not retry after close()
			setState((prev) => ({ ...prev, isLive: false }));
			es.close();
		};

		// Mark as live once connection opens and we start receiving events
		es.onopen = () => {
			setState((prev) => ({ ...prev, isLive: true }));
		};

		return () => {
			es.close();
			sourceRef.current = null;
		};
	}, [runId, enabled]);

	return state;
}
