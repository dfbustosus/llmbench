"use client";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
} from "@llmbench/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "@/trpc/client";

const SCORER_OPTIONS = [
	{ type: "exact-match", label: "Exact Match" },
	{ type: "contains", label: "Contains" },
	{ type: "regex", label: "Regex" },
	{ type: "json-match", label: "JSON Match" },
	{ type: "json-schema", label: "JSON Schema" },
	{ type: "is-json", label: "Is JSON" },
	{ type: "is-sql", label: "Is SQL" },
	{ type: "is-xml", label: "Is XML" },
	{ type: "is-valid-function-call", label: "Valid Function Call" },
	{ type: "cosine-similarity", label: "Cosine Similarity" },
	{ type: "levenshtein", label: "Levenshtein" },
	{ type: "bleu", label: "BLEU" },
	{ type: "rouge", label: "ROUGE" },
	{ type: "tool-call-accuracy", label: "Tool Call Accuracy" },
	{ type: "trajectory-validation", label: "Trajectory Validation" },
] as const;

type RunnableScorerType = (typeof SCORER_OPTIONS)[number]["type"];

interface StartRunDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	datasetId: string;
	datasetName: string;
}

export function StartRunDialog({
	open,
	onOpenChange,
	projectId,
	datasetId,
	datasetName,
}: StartRunDialogProps) {
	const router = useRouter();
	const providersQuery = trpc.evalRun.getProvidersByProject.useQuery(projectId, { enabled: open });
	const providers = providersQuery.data ?? [];
	const runnableProviders = providers.filter((provider) => provider.type !== "custom");

	const [providerIds, setProviderIds] = useState<string[]>([]);
	const [providersInitialized, setProvidersInitialized] = useState(false);
	const [scorers, setScorers] = useState<RunnableScorerType[]>(["exact-match"]);
	const [concurrency, setConcurrency] = useState("5");
	const [maxRetries, setMaxRetries] = useState("3");
	const [timeoutMs, setTimeoutMs] = useState("30000");
	const [cacheEnabled, setCacheEnabled] = useState(true);
	const [ttlHours, setTtlHours] = useState("24");
	const [error, setError] = useState<string | null>(null);

	const utils = trpc.useUtils();
	const startMutation = trpc.evalRun.start.useMutation({
		onSuccess: (run) => {
			utils.evalRun.listByProject.invalidate({ projectId });
			utils.evalRun.getById.invalidate(run.id);
			utils.project.stats.invalidate();
			setError(null);
			onOpenChange(false);
			router.push(`/projects/${projectId}/runs/${run.id}`);
		},
		onError: (err) => setError(err.message),
	});

	useEffect(() => {
		if (!open) {
			setProviderIds([]);
			setProvidersInitialized(false);
			setError(null);
			return;
		}

		if (!providersInitialized && providers.length > 0) {
			setProviderIds(
				providers.filter((provider) => provider.type !== "custom").map((provider) => provider.id),
			);
			setProvidersInitialized(true);
		}
	}, [open, providers, providersInitialized]);

	function toggleProvider(providerId: string, checked: boolean) {
		setProviderIds((current) =>
			checked ? [...current, providerId] : current.filter((id) => id !== providerId),
		);
	}

	function toggleScorer(scorer: RunnableScorerType, checked: boolean) {
		setScorers((current) => {
			if (checked) {
				return current.includes(scorer) ? current : [...current, scorer];
			}
			return current.filter((item) => item !== scorer);
		});
	}

	function positiveInt(value: string, fallback: number): number {
		const parsed = Number.parseInt(value, 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
	}

	function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setError(null);

		if (providerIds.length === 0) {
			setError("Select at least one provider.");
			return;
		}
		if (scorers.length === 0) {
			setError("Select at least one scorer.");
			return;
		}

		startMutation.mutate({
			projectId,
			datasetId,
			providerIds,
			scorers,
			concurrency: positiveInt(concurrency, 5),
			maxRetries: Math.max(0, Number.parseInt(maxRetries, 10) || 0),
			timeoutMs: positiveInt(timeoutMs, 30000),
			cacheEnabled,
			ttlHours: cacheEnabled ? positiveInt(ttlHours, 24) : undefined,
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Run Evaluation</DialogTitle>
						<DialogDescription>
							Start an evaluation for <span className="font-medium">{datasetName}</span>.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-6 py-4">
						<section className="space-y-3">
							<div>
								<h3 className="text-sm font-medium">Providers</h3>
								<p className="text-xs text-muted-foreground">
									Providers are loaded from this project. API keys are resolved from environment
									variables at runtime.
								</p>
							</div>

							{providersQuery.isLoading && (
								<p className="text-sm text-muted-foreground">Loading providers...</p>
							)}

							{!providersQuery.isLoading && providers.length === 0 && (
								<div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
									No providers found for this project yet. Add one from the{" "}
									<a
										href={`/projects/${projectId}/providers`}
										className="font-medium text-primary hover:underline"
									>
										Providers page
									</a>
									.
								</div>
							)}

							{!providersQuery.isLoading &&
								providers.length > 0 &&
								runnableProviders.length === 0 && (
									<div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
										This project only has custom providers. Custom providers require SDK/CLI code
										and cannot run from the dashboard.
									</div>
								)}

							<div className="grid gap-2 sm:grid-cols-2">
								{providers.map((provider) => (
									<label
										key={provider.id}
										className="flex items-start gap-3 rounded-md border p-3 text-sm"
									>
										<input
											type="checkbox"
											className="mt-1"
											disabled={provider.type === "custom"}
											checked={providerIds.includes(provider.id)}
											onChange={(event) => toggleProvider(provider.id, event.target.checked)}
										/>
										<span>
											<span className="block font-medium">{provider.name}</span>
											<span className="block text-xs text-muted-foreground">
												{provider.type} / {provider.model}
											</span>
											{provider.type === "custom" && (
												<span className="block text-xs text-muted-foreground">SDK/CLI only</span>
											)}
										</span>
									</label>
								))}
							</div>
						</section>

						<section className="space-y-3">
							<div>
								<h3 className="text-sm font-medium">Scorers</h3>
								<p className="text-xs text-muted-foreground">
									This first dashboard runner supports deterministic and local scorers. LLM-judge,
									RAG, composite, and embedding scorers remain available from config/CLI.
								</p>
							</div>
							<div className="grid gap-2 sm:grid-cols-2">
								{SCORER_OPTIONS.map((scorer) => (
									<label
										key={scorer.type}
										className="flex items-center gap-3 rounded-md border p-3 text-sm"
									>
										<input
											type="checkbox"
											checked={scorers.includes(scorer.type)}
											onChange={(event) => toggleScorer(scorer.type, event.target.checked)}
										/>
										<span>{scorer.label}</span>
									</label>
								))}
							</div>
						</section>

						<section className="grid gap-4 sm:grid-cols-3">
							<div className="space-y-2">
								<Label htmlFor="run-concurrency">Concurrency</Label>
								<Input
									id="run-concurrency"
									type="number"
									min={1}
									max={50}
									value={concurrency}
									onChange={(event) => setConcurrency(event.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="run-retries">Retries</Label>
								<Input
									id="run-retries"
									type="number"
									min={0}
									max={10}
									value={maxRetries}
									onChange={(event) => setMaxRetries(event.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="run-timeout">Timeout (ms)</Label>
								<Input
									id="run-timeout"
									type="number"
									min={1000}
									max={300000}
									value={timeoutMs}
									onChange={(event) => setTimeoutMs(event.target.value)}
								/>
							</div>
						</section>

						<section className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
							<label className="flex items-center gap-3 text-sm">
								<input
									type="checkbox"
									checked={cacheEnabled}
									onChange={(event) => setCacheEnabled(event.target.checked)}
								/>
								<span>Use response cache</span>
							</label>
							<div className="flex items-center gap-2">
								<Label htmlFor="run-cache-ttl" className="text-xs text-muted-foreground">
									TTL hours
								</Label>
								<Input
									id="run-cache-ttl"
									type="number"
									min={1}
									className="w-24"
									value={ttlHours}
									disabled={!cacheEnabled}
									onChange={(event) => setTtlHours(event.target.value)}
								/>
							</div>
						</section>
					</div>

					{error && <p className="pb-2 text-sm text-destructive">{error}</p>}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={
								startMutation.isPending ||
								runnableProviders.length === 0 ||
								providerIds.length === 0 ||
								scorers.length === 0
							}
						>
							{startMutation.isPending ? "Starting..." : "Start Run"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
