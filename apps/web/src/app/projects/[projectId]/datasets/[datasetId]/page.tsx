"use client";

import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	ConfirmDialog,
} from "@llmbench/ui";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { AddTestCaseDialog } from "@/components/datasets/add-test-case-dialog";
import { trpc } from "@/trpc/client";

export default function DatasetDetailPage({
	params,
}: {
	params: Promise<{ projectId: string; datasetId: string }>;
}) {
	const { projectId, datasetId } = use(params);
	const router = useRouter();

	const datasetQuery = trpc.dataset.getById.useQuery(datasetId);
	const testCasesQuery = trpc.dataset.getTestCases.useQuery(datasetId);

	const dataset = datasetQuery.data;
	const testCases = testCasesQuery.data ?? [];

	const [addOpen, setAddOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const utils = trpc.useUtils();
	const deleteMutation = trpc.dataset.delete.useMutation({
		onSuccess: () => {
			utils.dataset.listByProject.invalidate(projectId);
			router.push(`/projects/${projectId}/datasets`);
		},
		onError: (err) => setDeleteError(err.message),
	});

	if (datasetQuery.isLoading) {
		return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
	}

	if (!dataset) {
		return (
			<div className="text-center py-12 text-muted-foreground">
				Dataset not found.{" "}
				<a href={`/projects/${projectId}/datasets`} className="underline hover:text-foreground">
					Back to datasets
				</a>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div className="flex items-center gap-4">
				<a
					href={`/projects/${projectId}/datasets`}
					className="text-muted-foreground hover:text-foreground"
				>
					Datasets
				</a>
				<span className="text-muted-foreground">/</span>
				<h1 className="text-2xl font-bold">{dataset.name}</h1>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Dataset Info</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-sm space-y-1 text-muted-foreground">
						{dataset.description && <p>{dataset.description}</p>}
						<p>Version: {dataset.version}</p>
						<p>Created: {new Date(dataset.createdAt).toLocaleDateString()}</p>
					</div>
				</CardContent>
			</Card>

			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold">Test Cases ({testCases.length})</h2>
				<div className="flex gap-2">
					<Button size="sm" onClick={() => setAddOpen(true)}>
						Add Test Case
					</Button>
					<Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
						Delete Dataset
					</Button>
				</div>
			</div>

			{testCases.length > 0 ? (
				<Card>
					<CardContent className="pt-6">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b">
										<th className="py-3 text-left font-medium">#</th>
										<th className="py-3 text-left font-medium">Input</th>
										<th className="py-3 text-left font-medium">Expected</th>
										<th className="py-3 text-left font-medium">Tags</th>
									</tr>
								</thead>
								<tbody>
									{testCases.map((tc, i) => (
										<tr key={tc.id} className="border-b hover:bg-muted/50">
											<td className="py-3 text-muted-foreground">{i + 1}</td>
											<td className="py-3 max-w-[300px] truncate">{tc.input}</td>
											<td className="py-3 max-w-[300px] truncate">{tc.expected}</td>
											<td className="py-3">
												<div className="flex gap-1 flex-wrap">
													{(tc.tags ?? []).map((tag) => (
														<Badge key={tag} variant="secondary">
															{tag}
														</Badge>
													))}
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardContent className="pt-6 text-center py-12">
						<p className="text-muted-foreground">No test cases yet. Add one to get started.</p>
					</CardContent>
				</Card>
			)}

			<AddTestCaseDialog open={addOpen} onOpenChange={setAddOpen} datasetId={datasetId} />
			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={(open) => {
					setDeleteOpen(open);
					if (!open) setDeleteError(null);
				}}
				title="Delete Dataset"
				description="This will permanently delete this dataset and all its test cases. This action cannot be undone."
				onConfirm={() => deleteMutation.mutate(datasetId)}
				loading={deleteMutation.isPending}
				error={deleteError}
			/>
		</div>
	);
}
