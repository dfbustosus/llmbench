import { EventRepository } from "@llmbench/db";
import { getDB } from "@/trpc/server";

const POLL_INTERVAL_MS = 500;
const KEEPALIVE_INTERVAL_MS = 15_000;
const TERMINAL_EVENTS = new Set(["run:completed", "run:failed", "rescore:completed"]);

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
	const { runId } = await params;

	// Read cursor from Last-Event-ID header (SSE reconnect) or query param (initial)
	const lastEventId = req.headers.get("Last-Event-ID");
	const url = new URL(req.url);
	const cursor = lastEventId ? Number(lastEventId) : Number(url.searchParams.get("cursor") ?? "0");

	const eventRepo = new EventRepository(getDB());

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let currentCursor = cursor;
			let closed = false;
			let pollTimer: ReturnType<typeof setInterval> | undefined;
			let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

			function send(text: string) {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					// Stream closed
					cleanup();
				}
			}

			function closeStream() {
				if (closed) return;
				closed = true;
				cleanup();
				try {
					controller.close();
				} catch {
					// Already closed
				}
			}

			function poll() {
				if (closed) return;
				try {
					const events = eventRepo.findAfterCursor(runId, currentCursor);
					let foundTerminal = false;

					for (const event of events) {
						send(`event: ${event.eventType}\nid: ${event.seq}\ndata: ${event.payload}\n\n`);
						currentCursor = event.seq;
						if (TERMINAL_EVENTS.has(event.eventType)) {
							foundTerminal = true;
						}
					}

					if (foundTerminal) {
						send("event: stream:end\ndata: {}\n\n");
						closeStream();
					}
				} catch {
					closeStream();
				}
			}

			function cleanup() {
				if (pollTimer) clearInterval(pollTimer);
				if (keepaliveTimer) clearInterval(keepaliveTimer);
				pollTimer = undefined;
				keepaliveTimer = undefined;
			}

			// Handle client disconnect
			req.signal.addEventListener("abort", () => {
				closeStream();
			});

			// Initial poll (catch up on past events)
			poll();

			// Don't start interval polling if stream was already closed
			if (closed || req.signal.aborted) return;

			pollTimer = setInterval(poll, POLL_INTERVAL_MS);
			keepaliveTimer = setInterval(() => {
				send(": keepalive\n\n");
			}, KEEPALIVE_INTERVAL_MS);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
