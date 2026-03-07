import type { ModelPricing } from "@llmbench/types";

export const PRICING_TABLE: ModelPricing[] = [
	// OpenAI
	{ model: "gpt-4o", provider: "openai", inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
	{
		model: "gpt-4o-mini",
		provider: "openai",
		inputPricePerMillion: 0.15,
		outputPricePerMillion: 0.6,
	},
	{ model: "gpt-4-turbo", provider: "openai", inputPricePerMillion: 10, outputPricePerMillion: 30 },
	{ model: "gpt-4", provider: "openai", inputPricePerMillion: 30, outputPricePerMillion: 60 },
	{
		model: "gpt-3.5-turbo",
		provider: "openai",
		inputPricePerMillion: 0.5,
		outputPricePerMillion: 1.5,
	},
	{ model: "o1", provider: "openai", inputPricePerMillion: 15, outputPricePerMillion: 60 },
	{ model: "o1-mini", provider: "openai", inputPricePerMillion: 3, outputPricePerMillion: 12 },
	{ model: "o3-mini", provider: "openai", inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },

	// Anthropic
	{
		model: "claude-opus-4-6",
		provider: "anthropic",
		inputPricePerMillion: 15,
		outputPricePerMillion: 75,
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
		inputPricePerMillion: 0.8,
		outputPricePerMillion: 4,
	},
	{
		model: "claude-3-5-sonnet-20241022",
		provider: "anthropic",
		inputPricePerMillion: 3,
		outputPricePerMillion: 15,
	},
	{
		model: "claude-3-5-haiku-20241022",
		provider: "anthropic",
		inputPricePerMillion: 0.8,
		outputPricePerMillion: 4,
	},

	// Google
	{
		model: "gemini-2.0-flash",
		provider: "google",
		inputPricePerMillion: 0.1,
		outputPricePerMillion: 0.4,
	},
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
];
