"use client";

import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	ConfirmDialog,
} from "@llmbench/ui";
import { use, useState } from "react";
import { CreateDatasetDialog } from "@/components/datasets/create-dataset-dialog";
import { trpc } from "@/trpc/client";

export default function DatasetsPage({ params }: { params: Promise<{ projectId: string }> }) {
	const { projectId } = use(params);
	const projectQuery = trpc.project.getById.useQuery(projectId);
	const datasetsQuery = trpc.dataset.listByProject.useQuery(projectId);

	const project = projectQuery.data;
	const datasets = datasetsQuery.data ?? [];

	const [createOpen, setCreateOpen] = useState(false);
	const [deleteDatasetId, setDeleteDatasetId] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const utils = trpc.useUtils();
	const deleteMutation = trpc.dataset.delete.useMutation({
		onSuccess: () => {
			utils.dataset.listByProject.invalidate(projectId);
			setDeleteDatasetId(null);
			setDeleteError(null);
		},
		onError: (err) => setDeleteError(err.message),
	});

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold tracking-tight">
					{project?.name ?? "Project"} - Datasets
				</h1>
				<Button onClick={() => setCreateOpen(true)}>New Dataset</Button>
			</div>

			<div className="flex gap-4 text-sm">
				<a
					href={`/projects/${projectId}/runs`}
					className="text-muted-foreground hover:text-foreground"
				>
					Runs
				</a>
				<a href={`/projects/${projectId}/datasets`} className="font-medium text-primary">
					Datasets
				</a>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				{datasets.map((dataset) => (
					<Card key={dataset.id}>
						<CardHeader>
							<CardTitle>
								<a
									href={`/projects/${projectId}/datasets/${dataset.id}`}
									className="hover:underline"
								>
									{dataset.name}
								</a>
							</CardTitle>
							{dataset.description && <CardDescription>{dataset.description}</CardDescription>}
						</CardHeader>
						<CardContent>
							<div className="flex justify-between items-center text-sm text-muted-foreground">
								<div className="space-y-1">
									<p>Version: {dataset.version}</p>
									<p>Created: {new Date(dataset.createdAt).toLocaleDateString()}</p>
								</div>
								<Button
									variant="ghost"
									size="sm"
									className="text-destructive hover:text-destructive"
									onClick={() => setDeleteDatasetId(dataset.id)}
								>
									Delete
								</Button>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{datasets.length === 0 && (
				<Card>
					<CardContent className="pt-6 text-center py-12">
						<p className="text-muted-foreground">
							No datasets yet. Click <strong>New Dataset</strong> to create one.
						</p>
					</CardContent>
				</Card>
			)}

			<CreateDatasetDialog open={createOpen} onOpenChange={setCreateOpen} projectId={projectId} />
			<ConfirmDialog
				open={!!deleteDatasetId}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteDatasetId(null);
						setDeleteError(null);
					}
				}}
				title="Delete Dataset"
				description="This will permanently delete this dataset and all its test cases. This action cannot be undone."
				onConfirm={() => {
					if (deleteDatasetId) deleteMutation.mutate(deleteDatasetId);
				}}
				loading={deleteMutation.isPending}
				error={deleteError}
			/>
		</div>
	);
}
