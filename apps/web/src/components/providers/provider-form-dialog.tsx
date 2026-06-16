"use client";

import type { ProviderConfig, ProviderType } from "@llmbench/types";
import { Input, Label, Select, Textarea } from "@llmbench/ui";
import { useEffect, useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { trpc } from "@/trpc/client";

const PROVIDER_TYPES = [
	{ value: "openai", label: "OpenAI", env: "OPENAI_API_KEY" },
	{ value: "azure-openai", label: "Azure OpenAI", env: "AZURE_OPENAI_API_KEY" },
	{ value: "anthropic", label: "Anthropic", env: "ANTHROPIC_API_KEY" },
	{ value: "google", label: "Google AI", env: "GOOGLE_AI_API_KEY" },
	{ value: "mistral", label: "Mistral", env: "MISTRAL_API_KEY" },
	{ value: "together", label: "Together AI", env: "TOGETHER_API_KEY" },
	{ value: "bedrock", label: "AWS Bedrock", env: "AWS credentials" },
	{ value: "ollama", label: "Ollama", env: "none" },
] as const;

type DashboardProviderType = (typeof PROVIDER_TYPES)[number]["value"];

interface ProviderRecordLike {
	id: string;
	type: ProviderType;
	name: string;
	model: string;
	config?: Partial<ProviderConfig>;
}

interface ProviderFormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	provider?: ProviderRecordLike | null;
}

function isDashboardProviderType(type: ProviderType): type is DashboardProviderType {
	return PROVIDER_TYPES.some((option) => option.value === type);
}

function numberOrUndefined(value: string): number | undefined {
	if (!value.trim()) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function ProviderFormDialog({
	open,
	onOpenChange,
	projectId,
	provider,
}: ProviderFormDialogProps) {
	const isEditing = !!provider;
	const [type, setType] = useState<DashboardProviderType>("openai");
	const [name, setName] = useState("");
	const [model, setModel] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [systemMessage, setSystemMessage] = useState("");
	const [temperature, setTemperature] = useState("");
	const [maxTokens, setMaxTokens] = useState("");
	const [topP, setTopP] = useState("");
	const [stream, setStream] = useState(false);
	const [jsonMode, setJsonMode] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const utils = trpc.useUtils();
	const invalidateProviders = () => {
		utils.provider.listByProject.invalidate(projectId);
		utils.evalRun.getProvidersByProject.invalidate(projectId);
	};

	const createMutation = trpc.provider.create.useMutation({
		onSuccess: () => {
			invalidateProviders();
			setError(null);
			onOpenChange(false);
		},
		onError: (err) => setError(err.message),
	});

	const updateMutation = trpc.provider.update.useMutation({
		onSuccess: () => {
			invalidateProviders();
			setError(null);
			onOpenChange(false);
		},
		onError: (err) => setError(err.message),
	});

	useEffect(() => {
		if (!open) return;

		const providerType = provider?.type;
		setType(providerType && isDashboardProviderType(providerType) ? providerType : "openai");
		setName(provider?.name ?? "");
		setModel(provider?.model ?? "");
		setBaseUrl(provider?.config?.baseUrl ?? "");
		setSystemMessage(provider?.config?.systemMessage ?? "");
		setTemperature(provider?.config?.temperature?.toString() ?? "");
		setMaxTokens(provider?.config?.maxTokens?.toString() ?? "");
		setTopP(provider?.config?.topP?.toString() ?? "");
		setStream(provider?.config?.stream ?? false);
		setJsonMode(provider?.config?.responseFormat?.type === "json_object");
		setError(null);
	}, [open, provider]);

	function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		if (!name.trim() || !model.trim()) return;
		setError(null);

		const input = {
			type,
			name: name.trim(),
			model: model.trim(),
			config: {
				baseUrl: baseUrl.trim() || undefined,
				systemMessage: systemMessage.trim() || undefined,
				temperature: numberOrUndefined(temperature),
				maxTokens: numberOrUndefined(maxTokens),
				topP: numberOrUndefined(topP),
				stream,
				jsonMode,
			},
		};

		if (provider) {
			updateMutation.mutate({ id: provider.id, ...input });
			return;
		}

		createMutation.mutate({ projectId, ...input });
	}

	const selectedType = PROVIDER_TYPES.find((option) => option.value === type);
	const isPending = createMutation.isPending || updateMutation.isPending;

	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title={isEditing ? "Edit Provider" : "Add Provider"}
			description="API keys are not stored. Configure them as environment variables before running evaluations."
			submitLabel={isEditing ? "Save" : "Add Provider"}
			pendingLabel={isEditing ? "Saving..." : "Adding..."}
			isPending={isPending}
			isValid={!!name.trim() && !!model.trim()}
			error={error}
			onSubmit={handleSubmit}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="provider-type">Type</Label>
					<Select
						id="provider-type"
						value={type}
						onChange={(event) => setType(event.target.value as DashboardProviderType)}
					>
						{PROVIDER_TYPES.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</Select>
					<p className="text-xs text-muted-foreground">
						Environment: <code>{selectedType?.env}</code>
					</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="provider-name">Name</Label>
					<Input
						id="provider-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="GPT-4o"
						required
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="provider-model">Model</Label>
					<Input
						id="provider-model"
						value={model}
						onChange={(event) => setModel(event.target.value)}
						placeholder="gpt-4o"
						required
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="provider-base-url">Base URL (optional)</Label>
					<Input
						id="provider-base-url"
						value={baseUrl}
						onChange={(event) => setBaseUrl(event.target.value)}
						placeholder="https://api.example.com/v1"
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="provider-system">System Message (optional)</Label>
				<Textarea
					id="provider-system"
					value={systemMessage}
					onChange={(event) => setSystemMessage(event.target.value)}
					placeholder="You are a helpful assistant."
					rows={3}
				/>
			</div>

			<div className="grid gap-4 sm:grid-cols-3">
				<div className="space-y-2">
					<Label htmlFor="provider-temperature">Temperature</Label>
					<Input
						id="provider-temperature"
						type="number"
						min={0}
						max={2}
						step={0.1}
						value={temperature}
						onChange={(event) => setTemperature(event.target.value)}
						placeholder="0"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="provider-max-tokens">Max Tokens</Label>
					<Input
						id="provider-max-tokens"
						type="number"
						min={1}
						value={maxTokens}
						onChange={(event) => setMaxTokens(event.target.value)}
						placeholder="1024"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="provider-top-p">Top P</Label>
					<Input
						id="provider-top-p"
						type="number"
						min={0}
						max={1}
						step={0.1}
						value={topP}
						onChange={(event) => setTopP(event.target.value)}
						placeholder="1"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:gap-6">
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={stream}
						onChange={(event) => setStream(event.target.checked)}
					/>
					<span>Stream responses</span>
				</label>
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={jsonMode}
						onChange={(event) => setJsonMode(event.target.checked)}
					/>
					<span>Request JSON mode</span>
				</label>
			</div>
		</FormDialog>
	);
}
