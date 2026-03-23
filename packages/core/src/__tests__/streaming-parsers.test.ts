import { describe, expect, it } from "vitest";
import { parseBedrockEventStream } from "../providers/streaming/bedrock-event-stream-parser.js";
import { parseNDJSON } from "../providers/streaming/ndjson-parser.js";
import { parseSSE } from "../providers/streaming/sse-parser.js";

function toStream(text: string): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(text));
			controller.close();
		},
	});
}

function toChunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});
}

describe("SSE Parser", () => {
	it("should parse basic SSE events", async () => {
		const stream = toStream("data: hello\n\ndata: world\n\n");
		const events = [];
		for await (const event of parseSSE(stream)) {
			events.push(event);
		}
		expect(events).toEqual([
			{ event: undefined, data: "hello" },
			{ event: undefined, data: "world" },
		]);
	});

	it("should parse events with event types", async () => {
		const stream = toStream(
			'event: message_start\ndata: {"type":"start"}\n\nevent: content_block_delta\ndata: {"text":"hi"}\n\n',
		);
		const events = [];
		for await (const event of parseSSE(stream)) {
			events.push(event);
		}
		expect(events).toHaveLength(2);
		expect(events[0].event).toBe("message_start");
		expect(events[1].event).toBe("content_block_delta");
	});

	it("should handle [DONE] sentinel", async () => {
		const stream = toStream('data: {"content":"hi"}\n\ndata: [DONE]\n\n');
		const events = [];
		for await (const event of parseSSE(stream)) {
			events.push(event);
		}
		expect(events).toHaveLength(2);
		expect(events[1].data).toBe("[DONE]");
	});

	it("should handle events split across chunk boundaries", async () => {
		const stream = toChunkedStream(["data: hel", "lo\n\ndata: world\n\n"]);
		const events = [];
		for await (const event of parseSSE(stream)) {
			events.push(event);
		}
		expect(events).toHaveLength(2);
		expect(events[0].data).toBe("hello");
		expect(events[1].data).toBe("world");
	});

	it("should handle multi-line data fields", async () => {
		const stream = toStream("data: line1\ndata: line2\n\n");
		const events = [];
		for await (const event of parseSSE(stream)) {
			events.push(event);
		}
		expect(events).toHaveLength(1);
		expect(events[0].data).toBe("line1\nline2");
	});

	it("should skip empty events", async () => {
		const stream = toStream("\n\ndata: hello\n\n\n\n");
		const events = [];
		for await (const event of parseSSE(stream)) {
			events.push(event);
		}
		expect(events).toHaveLength(1);
		expect(events[0].data).toBe("hello");
	});
});

describe("NDJSON Parser", () => {
	it("should parse newline-delimited JSON", async () => {
		const stream = toStream('{"a":1}\n{"b":2}\n');
		const results = [];
		for await (const item of parseNDJSON(stream)) {
			results.push(item);
		}
		expect(results).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("should skip empty lines", async () => {
		const stream = toStream('{"a":1}\n\n{"b":2}\n');
		const results = [];
		for await (const item of parseNDJSON(stream)) {
			results.push(item);
		}
		expect(results).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("should handle lines split across chunks", async () => {
		const stream = toChunkedStream(['{"a":', "1}\n", '{"b":2}\n']);
		const results = [];
		for await (const item of parseNDJSON(stream)) {
			results.push(item);
		}
		expect(results).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("should handle trailing data without newline", async () => {
		const stream = toStream('{"a":1}');
		const results = [];
		for await (const item of parseNDJSON(stream)) {
			results.push(item);
		}
		expect(results).toEqual([{ a: 1 }]);
	});
});

describe("Bedrock Event Stream Parser", () => {
	function buildBedrockMessage(eventType: string, payload: unknown): Uint8Array {
		const encoder = new TextEncoder();
		const payloadBytes = encoder.encode(JSON.stringify(payload));

		// Build header: :event-type string
		const eventTypeBytes = encoder.encode(eventType);
		const headerName = encoder.encode(":event-type");
		// Header format: nameLen(1) + name + type(1:7=string) + valueLen(2) + value
		const headerLen = 1 + headerName.length + 1 + 2 + eventTypeBytes.length;

		const totalLen = 12 + headerLen + payloadBytes.length + 4; // prelude(12) + headers + payload + msgCRC(4)
		const msg = new Uint8Array(totalLen);
		const view = new DataView(msg.buffer);

		// Prelude: totalLen(4) + headersLen(4) + preludeCRC(4)
		view.setUint32(0, totalLen);
		view.setUint32(4, headerLen);
		view.setUint32(8, 0); // CRC placeholder

		let pos = 12;
		// Header: nameLen
		msg[pos++] = headerName.length;
		msg.set(headerName, pos);
		pos += headerName.length;
		// Header type: 7 = string
		msg[pos++] = 7;
		// Value length (2 bytes big-endian)
		view.setUint16(pos, eventTypeBytes.length);
		pos += 2;
		msg.set(eventTypeBytes, pos);
		pos += eventTypeBytes.length;

		// Payload
		msg.set(payloadBytes, pos);
		pos += payloadBytes.length;

		// Message CRC placeholder
		view.setUint32(pos, 0);

		return msg;
	}

	it("should parse a single Bedrock event", async () => {
		const msg = buildBedrockMessage("contentBlockDelta", {
			delta: { text: "Hello" },
		});
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(msg);
				controller.close();
			},
		});

		const events = [];
		for await (const event of parseBedrockEventStream(stream)) {
			events.push(event);
		}
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("contentBlockDelta");
		expect(events[0].payload).toEqual({ delta: { text: "Hello" } });
	});

	it("should parse multiple Bedrock events", async () => {
		const msg1 = buildBedrockMessage("contentBlockDelta", { delta: { text: "Hi" } });
		const msg2 = buildBedrockMessage("metadata", { usage: { inputTokens: 5 } });
		const combined = new Uint8Array(msg1.length + msg2.length);
		combined.set(msg1);
		combined.set(msg2, msg1.length);

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(combined);
				controller.close();
			},
		});

		const events = [];
		for await (const event of parseBedrockEventStream(stream)) {
			events.push(event);
		}
		expect(events).toHaveLength(2);
		expect(events[0].type).toBe("contentBlockDelta");
		expect(events[1].type).toBe("metadata");
	});
});
