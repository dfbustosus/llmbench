// Template for llmbench.config.ts
export const CONFIG_TEMPLATE = `import type { LLMBenchConfig } from "@llmbench/types";

const config: LLMBenchConfig = {
  projectName: "{{projectName}}",
  description: "{{description}}",

  providers: [
    {
      type: "openai",
      name: "GPT-4o",
      model: "gpt-4o",
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
    concurrency: 5,
    maxRetries: 3,
    timeoutMs: 30000,
  },
};

export default config;
`;
