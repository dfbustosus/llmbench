/**
 * Parse a newline-delimited JSON stream from a ReadableStream<Uint8Array>.
 * Yields each parsed JSON object. Ignores empty lines.
 */
export async function* parseNDJSON<T = unknown>(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			const lines = buffer.split("\n");
			// Last element may be incomplete — keep it in buffer
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				yield JSON.parse(trimmed) as T;
			}
		}

		// Flush remaining buffer
		const trimmed = buffer.trim();
		if (trimmed) {
			yield JSON.parse(trimmed) as T;
		}
	} finally {
		reader.releaseLock();
	}
}
