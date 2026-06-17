import type { ProviderConfig } from "@llmbench/types";

const SECRET_EXTRA_KEYS = ["apiKey", "accessKeyId", "secretAccessKey", "sessionToken"];

interface ProviderConfigRecord {
	type: ProviderConfig["type"];
	name: string;
	model: string;
	config?: Partial<ProviderConfig>;
}

function stripSecrets(config?: Partial<ProviderConfig>): Partial<ProviderConfig> {
	const sanitized = { ...(config ?? {}) };
	delete sanitized.apiKey;

	if (sanitized.extra) {
		const extra = { ...sanitized.extra };
		for (const key of SECRET_EXTRA_KEYS) {
			delete extra[key];
		}
		sanitized.extra = Object.keys(extra).length > 0 ? extra : undefined;
	}

	return sanitized;
}

export function providerConfigFromRecord(record: ProviderConfigRecord): ProviderConfig {
	return {
		...stripSecrets(record.config),
		type: record.type,
		name: record.name,
		model: record.model,
	};
}
