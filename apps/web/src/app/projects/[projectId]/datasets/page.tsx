"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@llmbench/ui";
import { use } from "react";
import { trpc } from "@/trpc/client";

export default function DatasetsPage({ params }: { params: Promise<{ projectId: string }> }) {
	const { projectId } = use(params);
	const projectQuery = trpc.project.getById.useQuery(projectId);
	const datasetsQuery = trpc.dataset.listByProject.useQuery(projectId);

	const project = projectQuery.data;
	const datasets = datasetsQuery.data ?? [];

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">
					{project?.name ?? "Project"} - Datasets
				</h1>
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
							<CardTitle>{dataset.name}</CardTitle>
							{dataset.description && <CardDescription>{dataset.description}</CardDescription>}
						</CardHeader>
						<CardContent>
							<div className="text-sm text-muted-foreground space-y-1">
								<p>Version: {dataset.version}</p>
								<p>Created: {new Date(dataset.createdAt).toLocaleDateString()}</p>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{datasets.length === 0 && (
				<Card>
					<CardContent className="pt-6 text-center py-12">
						<p className="text-muted-foreground">
							No datasets yet. Add one via the CLI or import a JSON file.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
