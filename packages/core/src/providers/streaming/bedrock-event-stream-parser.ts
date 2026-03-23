export interface BedrockEvent {
	type: string;
	payload: unknown;
}

/**
 * Parse AWS Bedrock's binary event stream format from a ReadableStream<Uint8Array>.
 * The format uses: 4-byte total length, 4-byte headers length, 4-byte prelude CRC,
 * headers section, payload, 4-byte message CRC.
 *
 * We extract the :event-type header and parse the JSON payload for each message.
 */
export async function* parseBedrockEventStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<BedrockEvent> {
	const reader = body.getReader();
	let buffer = new Uint8Array(0);

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			// Append new data to buffer
			const newBuffer = new Uint8Array(buffer.length + value.length);
			newBuffer.set(buffer);
			newBuffer.set(value, buffer.length);
			buffer = newBuffer;

			// Try to parse complete messages from the buffer
			while (buffer.length >= 12) {
				const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
				const totalLength = view.getUint32(0);

				// Wait for full message
				if (buffer.length < totalLength) break;

				const headersLength = view.getUint32(4);
				// Skip prelude CRC (bytes 8-11)

				const headersStart = 12;
				const headersEnd = headersStart + headersLength;
				const payloadStart = headersEnd;
				const payloadEnd = totalLength - 4; // Last 4 bytes are message CRC

				// Parse headers to find :event-type
				let eventType = "";
				let pos = headersStart;
				while (pos < headersEnd) {
					const nameLength = buffer[pos];
					pos++;
					const name = new TextDecoder().decode(buffer.slice(pos, pos + nameLength));
					pos += nameLength;
					const headerType = buffer[pos];
					pos++;

					if (headerType === 7) {
						// Type 7 = string
						const valueLength = new DataView(buffer.buffer, buffer.byteOffset + pos, 2).getUint16(
							0,
						);
						pos += 2;
						const headerValue = new TextDecoder().decode(buffer.slice(pos, pos + valueLength));
						pos += valueLength;

						if (name === ":event-type") {
							eventType = headerValue;
						}
					} else {
						// Skip other header types (we only need :event-type)
						break;
					}
				}

				// Extract and parse payload
				const payloadBytes = buffer.slice(payloadStart, payloadEnd);
				let payload: unknown = {};
				if (payloadBytes.length > 0) {
					try {
						payload = JSON.parse(new TextDecoder().decode(payloadBytes));
					} catch {
						// Non-JSON payload, store as string
						payload = new TextDecoder().decode(payloadBytes);
					}
				}

				if (eventType) {
					yield { type: eventType, payload };
				}

				// Advance buffer past this message
				buffer = buffer.slice(totalLength);
			}
		}
	} finally {
		reader.releaseLock();
	}
}
