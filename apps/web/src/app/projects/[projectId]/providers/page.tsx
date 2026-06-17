"use client";

import type { ProviderConfig, ProviderType } from "@llmbench/types";
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	ConfirmDialog,
} from "@llmbench/ui";
import { use, useState } from "react";
import { ProviderFormDialog } from "@/components/providers/provider-form-dialog";
import { trpc } from "@/trpc/client";

interface ProviderSummary {
	id: string;
	type: ProviderType;
	name: string;
	model: string;
	config?: Partial<ProviderConfig>;
}

type ConnectionTestStatus =
	| { status: "testing"; message: string }
	| { status: "success"; message: string; output?: string }
	| { status: "error"; message: string };

function connectionStatusClass(status: ConnectionTestStatus["status"]): string {
	if (status === "success") {
		return "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300";
	}
	if (status === "error") {
		return "border-destructive/40 bg-destructive/10 text-destructive";
	}
	return "border-muted bg-muted/50 text-muted-foreground";
}

export default function ProvidersPage({ params }: { params: Promise<{ projectId: string }> }) {
	const { projectId } = use(params);
	const projectQuery = trpc.project.getById.useQuery(projectId);
	const providersQuery = trpc.provider.listByProject.useQuery(projectId);

	const project = projectQuery.data;
	const providers = providersQuery.data ?? [];

	const [createOpen, setCreateOpen] = useState(false);
	const [editProvider, setEditProvider] = useState<ProviderSummary | null>(null);
	const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [connectionStatuses, setConnectionStatuses] = useState<
		Record<string, ConnectionTestStatus>
	>({});

	const utils = trpc.useUtils();
	const deleteMutation = trpc.provider.delete.useMutation({
		onSuccess: () => {
			utils.provider.listByProject.invalidate(projectId);
			utils.evalRun.getProvidersByProject.invalidate(projectId);
			setDeleteProviderId(null);
			setDeleteError(null);
		},
		onError: (err) => setDeleteError(err.message),
	});
	const testConnectionMutation = trpc.provider.testConnection.useMutation({
		onMutate: ({ id }) => {
			setConnectionStatuses((current) => ({
				...current,
				[id]: { status: "testing", message: "Testing connection..." },
			}));
		},
		onSuccess: (result, { id }) => {
			setConnectionStatuses((current) => ({
				...current,
				[id]: {
					status: "success",
					message: `Connected in ${result.latencyMs}ms`,
					output: result.output || undefined,
				},
			}));
		},
		onError: (err, { id }) => {
			setConnectionStatuses((current) => ({
				...current,
				[id]: { status: "error", message: err.message },
			}));
		},
	});

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">
						{project?.name ?? "Project"} - Providers
					</h1>
					<p className="text-muted-foreground">
						Configure model providers used by dashboard-started evaluations
					</p>
				</div>
				<Button onClick={() => setCreateOpen(true)}>Add Provider</Button>
			</div>

			<div className="flex gap-4 text-sm">
				<a
					href={`/projects/${projectId}/runs`}
					className="text-muted-foreground hover:text-foreground"
				>
					Runs
				</a>
				<a
					href={`/projects/${projectId}/datasets`}
					className="text-muted-foreground hover:text-foreground"
				>
					Datasets
				</a>
				<a href={`/projects/${projectId}/providers`} className="font-medium text-primary">
					Providers
				</a>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{providers.map((provider) => {
					const connectionStatus = connectionStatuses[provider.id];
					const isTestingConnection = connectionStatus?.status === "testing";

					return (
						<Card key={provider.id}>
							<CardHeader>
								<div className="flex items-start justify-between gap-3">
									<div>
										<CardTitle>{provider.name}</CardTitle>
										<CardDescription>{provider.model}</CardDescription>
									</div>
									<Badge variant="secondary">{provider.type}</Badge>
								</div>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-1 text-sm text-muted-foreground">
									{provider.config?.baseUrl && <p>Base URL: {provider.config.baseUrl}</p>}
									{provider.config?.temperature != null && (
										<p>Temperature: {provider.config.temperature}</p>
									)}
									{provider.config?.maxTokens != null && (
										<p>Max tokens: {provider.config.maxTokens}</p>
									)}
									{provider.config?.topP != null && <p>Top P: {provider.config.topP}</p>}
									<div className="flex flex-wrap gap-2 pt-1">
										{provider.config?.stream && <Badge variant="outline">stream</Badge>}
										{provider.config?.responseFormat?.type === "json_object" && (
											<Badge variant="outline">json mode</Badge>
										)}
									</div>
								</div>

								<div className="flex gap-2">
									<Button
										variant="secondary"
										size="sm"
										disabled={provider.type === "custom" || isTestingConnection}
										onClick={() => testConnectionMutation.mutate({ id: provider.id })}
									>
										{isTestingConnection ? "Testing..." : "Test"}
									</Button>
									<Button
										variant="outline"
										size="sm"
										disabled={provider.type === "custom"}
										onClick={() => setEditProvider(provider)}
									>
										Edit
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="text-destructive hover:text-destructive"
										onClick={() => setDeleteProviderId(provider.id)}
									>
										Delete
									</Button>
								</div>
								{provider.type === "custom" && (
									<p className="text-xs text-muted-foreground">
										Custom providers are registered from SDK/CLI code and cannot be edited here.
									</p>
								)}
								{connectionStatus && (
									<div
										className={`rounded-md border p-3 text-sm ${connectionStatusClass(
											connectionStatus.status,
										)}`}
									>
										<p className="font-medium">{connectionStatus.message}</p>
										{connectionStatus.status === "success" && connectionStatus.output && (
											<p className="mt-1 line-clamp-2 break-words text-xs opacity-80">
												{connectionStatus.output}
											</p>
										)}
									</div>
								)}
							</CardContent>
						</Card>
					);
				})}
			</div>

			{providers.length === 0 && !providersQuery.isLoading && (
				<Card>
					<CardContent className="pt-6 text-center py-12">
						<h3 className="text-lg font-semibold">No providers yet</h3>
						<p className="text-muted-foreground mt-2">
							Add a provider to run evaluations directly from the dashboard.
						</p>
					</CardContent>
				</Card>
			)}

			<ProviderFormDialog open={createOpen} onOpenChange={setCreateOpen} projectId={projectId} />
			{editProvider && (
				<ProviderFormDialog
					open={!!editProvider}
					onOpenChange={(open) => {
						if (!open) setEditProvider(null);
					}}
					projectId={projectId}
					provider={editProvider}
				/>
			)}
			<ConfirmDialog
				open={!!deleteProviderId}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteProviderId(null);
						setDeleteError(null);
					}
				}}
				title="Delete Provider"
				description="This will delete the provider config from this project. Existing run results are not deleted."
				onConfirm={() => {
					if (deleteProviderId) deleteMutation.mutate(deleteProviderId);
				}}
				loading={deleteMutation.isPending}
				error={deleteError}
			/>
		</div>
	);
}
