import type { LLMBenchConfig } from "@llmbench/types";

const config: LLMBenchConfig = {
	projectName: "my-eval-project",
	description: "My LLM evaluation project",

	providers: [
		{
			type: "ollama",
			name: "Llama 3.2",
			model: "llama3.2",
		},
	],

	scorers: [
		{
			id: "exact-match",
			name: "Exact Match",
			type: "exact-match",
		},
		{
			id: "contains",
			name: "Contains",
			type: "contains",
		},
	],

	defaults: {
		concurrency: 2,
		maxRetries: 3,
		timeoutMs: 60000,
	},
};

export default config;
