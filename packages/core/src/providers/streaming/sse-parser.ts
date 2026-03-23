export interface SSEEvent {
	event?: string;
	data: string;
}

/**
 * Parse a Server-Sent Events stream from a ReadableStream<Uint8Array>.
 * Handles chunk boundaries, multi-line data fields, and event types.
 * Yields each complete SSE event as { event?, data }.
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// SSE events are separated by double newlines
			const parts = buffer.split("\n\n");
			// Last part may be incomplete — keep it in buffer
			buffer = parts.pop() ?? "";

			for (const part of parts) {
				if (!part.trim()) continue;

				let event: string | undefined;
				const dataLines: string[] = [];

				for (const line of part.split("\n")) {
					if (line.startsWith("event:")) {
						event = line.slice(6).trim();
					} else if (line.startsWith("data:")) {
						dataLines.push(line.slice(5).trimStart());
					}
					// Ignore comment lines (starting with :) and other fields
				}

				if (dataLines.length > 0) {
					yield { event, data: dataLines.join("\n") };
				}
			}
		}

		// Flush remaining buffer
		if (buffer.trim()) {
			const dataLines: string[] = [];
			let event: string | undefined;
			for (const line of buffer.split("\n")) {
				if (line.startsWith("event:")) {
					event = line.slice(6).trim();
				} else if (line.startsWith("data:")) {
					dataLines.push(line.slice(5).trimStart());
				}
			}
			if (dataLines.length > 0) {
				yield { event, data: dataLines.join("\n") };
			}
		}
	} finally {
		reader.releaseLock();
	}
}
