import type { ModelPricing } from "@llmbench/types";

export const PRICING_TABLE: ModelPricing[] = [
	// ── OpenAI — GPT-5 family ───────────────────────────────────────────
	{ model: "gpt-5.4", provider: "openai", inputPricePerMillion: 2.5, outputPricePerMillion: 15 },
	{
		model: "gpt-5.4-pro",
		provider: "openai",
		inputPricePerMillion: 30,
		outputPricePerMillion: 180,
	},
	{ model: "gpt-5.2", provider: "openai", inputPricePerMillion: 1.75, outputPricePerMillion: 14 },
	{
		model: "gpt-5.2-pro",
		provider: "openai",
		inputPricePerMillion: 21,
		outputPricePerMillion: 168,
	},
	{ model: "gpt-5.1", provider: "openai", inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
	{ model: "gpt-5", provider: "openai", inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
	{
		model: "gpt-5-pro",
		provider: "openai",
		inputPricePerMillion: 15,
		outputPricePerMillion: 120,
	},
	{ model: "gpt-5-mini", provider: "openai", inputPricePerMillion: 0.25, outputPricePerMillion: 2 },
	{
		model: "gpt-5-nano",
		provider: "openai",
		inputPricePerMillion: 0.05,
		outputPricePerMillion: 0.4,
	},

	// ── OpenAI — GPT-4 family ───────────────────────────────────────────
	{ model: "gpt-4.1", provider: "openai", inputPricePerMillion: 2, outputPricePerMillion: 8 },
	{
		model: "gpt-4.1-mini",
		provider: "openai",
		inputPricePerMillion: 0.4,
		outputPricePerMillion: 1.6,
	},
	{ model: "gpt-4o", provider: "openai", inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
	{
		model: "gpt-4o-mini",
		provider: "openai",
		inputPricePerMillion: 0.15,
		outputPricePerMillion: 0.6,
	},

	// ── OpenAI — Reasoning models ───────────────────────────────────────
	{ model: "o3", provider: "openai", inputPricePerMillion: 2, outputPricePerMillion: 8 },
	{ model: "o3-pro", provider: "openai", inputPricePerMillion: 20, outputPricePerMillion: 80 },
	{ model: "o4-mini", provider: "openai", inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },
	{ model: "o1", provider: "openai", inputPricePerMillion: 15, outputPricePerMillion: 60 },

	// ── Anthropic — Current ─────────────────────────────────────────────
	{
		model: "claude-opus-4-6",
		provider: "anthropic",
		inputPricePerMillion: 5,
		outputPricePerMillion: 25,
	},
	{
		model: "claude-sonnet-4-6",
		provider: "anthropic",
		inputPricePerMillion: 3,
		outputPricePerMillion: 15,
	},
	{
		model: "claude-haiku-4-5-20251001",
		provider: "anthropic",
		inputPricePerMillion: 1,
		outputPricePerMillion: 5,
	},

	// ── Anthropic — Legacy ──────────────────────────────────────────────
	{
		model: "claude-sonnet-4-5-20250929",
		provider: "anthropic",
		inputPricePerMillion: 3,
		outputPricePerMillion: 15,
	},
	{
		model: "claude-opus-4-5-20251101",
		provider: "anthropic",
		inputPricePerMillion: 5,
		outputPricePerMillion: 25,
	},
	{
		model: "claude-opus-4-1-20250805",
		provider: "anthropic",
		inputPricePerMillion: 15,
		outputPricePerMillion: 75,
	},
	{
		model: "claude-sonnet-4-20250514",
		provider: "anthropic",
		inputPricePerMillion: 3,
		outputPricePerMillion: 15,
	},
	{
		model: "claude-opus-4-20250514",
		provider: "anthropic",
		inputPricePerMillion: 15,
		outputPricePerMillion: 75,
	},
	{
		model: "claude-3-haiku-20240307",
		provider: "anthropic",
		inputPricePerMillion: 0.25,
		outputPricePerMillion: 1.25,
	},

	// ── Google — Gemini 3.x ─────────────────────────────────────────────
	{
		model: "gemini-3.1-pro-preview",
		provider: "google",
		inputPricePerMillion: 2,
		outputPricePerMillion: 12,
	},
	{
		model: "gemini-3.1-flash-lite-preview",
		provider: "google",
		inputPricePerMillion: 0.25,
		outputPricePerMillion: 1.5,
	},
	{
		model: "gemini-3-flash-preview",
		provider: "google",
		inputPricePerMillion: 0.5,
		outputPricePerMillion: 3,
	},

	// ── Google — Gemini 2.x ─────────────────────────────────────────────
	{
		model: "gemini-2.5-pro",
		provider: "google",
		inputPricePerMillion: 1.25,
		outputPricePerMillion: 10,
	},
	{
		model: "gemini-2.5-flash",
		provider: "google",
		inputPricePerMillion: 0.3,
		outputPricePerMillion: 2.5,
	},
	{
		model: "gemini-2.5-flash-lite",
		provider: "google",
		inputPricePerMillion: 0.1,
		outputPricePerMillion: 0.4,
	},
	{
		model: "gemini-2.0-flash",
		provider: "google",
		inputPricePerMillion: 0.1,
		outputPricePerMillion: 0.4,
	},

	// ── Google — Gemini 1.5 (legacy) ────────────────────────────────────
	{
		model: "gemini-1.5-pro",
		provider: "google",
		inputPricePerMillion: 1.25,
		outputPricePerMillion: 5,
	},
	{
		model: "gemini-1.5-flash",
		provider: "google",
		inputPricePerMillion: 0.075,
		outputPricePerMillion: 0.3,
	},

	// ── Mistral AI ──────────────────────────────────────────────────────
	{
		model: "mistral-large-latest",
		provider: "mistral",
		inputPricePerMillion: 0.5,
		outputPricePerMillion: 1.5,
	},
	{
		model: "mistral-small-latest",
		provider: "mistral",
		inputPricePerMillion: 0.1,
		outputPricePerMillion: 0.3,
	},
	{
		model: "mistral-medium-latest",
		provider: "mistral",
		inputPricePerMillion: 0.4,
		outputPricePerMillion: 2,
	},
	{
		model: "codestral-latest",
		provider: "mistral",
		inputPricePerMillion: 0.3,
		outputPricePerMillion: 0.9,
	},
	{
		model: "open-mistral-nemo",
		provider: "mistral",
		inputPricePerMillion: 0.02,
		outputPricePerMillion: 0.04,
	},

	// ── Together AI ─────────────────────────────────────────────────────
	{
		model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
		provider: "together",
		inputPricePerMillion: 0.88,
		outputPricePerMillion: 0.88,
	},
	{
		model: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
		provider: "together",
		inputPricePerMillion: 0.27,
		outputPricePerMillion: 0.85,
	},
	{
		model: "deepseek-ai/DeepSeek-V3.1",
		provider: "together",
		inputPricePerMillion: 0.6,
		outputPricePerMillion: 1.7,
	},
	{
		model: "Qwen/Qwen3-235B-A22B-Instruct-2507-tput",
		provider: "together",
		inputPricePerMillion: 0.2,
		outputPricePerMillion: 0.6,
	},

	// ── AWS Bedrock ─────────────────────────────────────────────────────
	{
		model: "anthropic.claude-sonnet-4-6",
		provider: "bedrock",
		inputPricePerMillion: 3,
		outputPricePerMillion: 15,
	},
	{
		model: "anthropic.claude-haiku-4-5-20251001-v1:0",
		provider: "bedrock",
		inputPricePerMillion: 1,
		outputPricePerMillion: 5,
	},
	{
		model: "anthropic.claude-opus-4-6-v1",
		provider: "bedrock",
		inputPricePerMillion: 5,
		outputPricePerMillion: 25,
	},
	{
		model: "meta.llama3-3-70b-instruct-v1:0",
		provider: "bedrock",
		inputPricePerMillion: 0.72,
		outputPricePerMillion: 0.72,
	},
	{
		model: "amazon.nova-pro-v1:0",
		provider: "bedrock",
		inputPricePerMillion: 0.8,
		outputPricePerMillion: 3.2,
	},
	{
		model: "amazon.nova-lite-v1:0",
		provider: "bedrock",
		inputPricePerMillion: 0.06,
		outputPricePerMillion: 0.24,
	},
	{
		model: "amazon.nova-micro-v1:0",
		provider: "bedrock",
		inputPricePerMillion: 0.035,
		outputPricePerMillion: 0.14,
	},
];
