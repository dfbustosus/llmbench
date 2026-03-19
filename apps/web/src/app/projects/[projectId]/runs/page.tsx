"use client";

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@llmbench/ui";
import { use, useEffect, useMemo } from "react";
import { ScoreTrendChart } from "@/components/charts/score-trend-chart";
import { trpc } from "@/trpc/client";

function statusVariant(status: string) {
	switch (status) {
		case "completed":
			return "success" as const;
		case "failed":
			return "destructive" as const;
		case "cancelled":
			return "warning" as const;
		case "running":
			return "default" as const;
		default:
			return "secondary" as const;
	}
}

export default function RunsPage({ params }: { params: Promise<{ projectId: string }> }) {
	const { projectId } = use(params);
	const projectQuery = trpc.project.getById.useQuery(projectId);

	const runsQuery = trpc.evalRun.listByProject.useQuery({ projectId });
	const runs = runsQuery.data ?? [];

	// Auto-refresh when any run is active
	const hasActiveRun = useMemo(
		() => runs.some((r) => r.status === "running" || r.status === "pending"),
		[runs],
	);
	const { refetch: refetchRuns } = runsQuery;
	useEffect(() => {
		if (!hasActiveRun) return;
		const timer = setInterval(() => refetchRuns(), 2000);
		return () => clearInterval(timer);
	}, [hasActiveRun, refetchRuns]);

	const project = projectQuery.data;

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">{project?.name ?? "Project"} - Runs</h1>
				<p className="text-muted-foreground">
					{project?.description ?? "Evaluation runs for this project"}
				</p>
			</div>

			<div className="flex gap-4 text-sm">
				<a href={`/projects/${projectId}/runs`} className="font-medium text-primary">
					Runs
				</a>
				<a
					href={`/projects/${projectId}/datasets`}
					className="text-muted-foreground hover:text-foreground"
				>
					Datasets
				</a>
			</div>

			{/* Score Trend */}
			{runs.length > 1 && (
				<Card>
					<CardHeader>
						<CardTitle>Score Trend</CardTitle>
					</CardHeader>
					<CardContent>
						<ScoreTrendChart runs={runs} />
					</CardContent>
				</Card>
			)}

			{/* Runs Table */}
			<Card>
				<CardHeader>
					<CardTitle>Evaluation Runs</CardTitle>
					<CardDescription>{runs.length} runs total</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b">
									<th className="py-3 text-left font-medium">Run ID</th>
									<th className="py-3 text-left font-medium">Status</th>
									<th className="py-3 text-left font-medium">Cases</th>
									<th className="py-3 text-left font-medium">Cost</th>
									<th className="py-3 text-left font-medium">Latency</th>
									<th className="py-3 text-left font-medium">Created</th>
								</tr>
							</thead>
							<tbody>
								{runs.map((run) => (
									<tr key={run.id} className="border-b hover:bg-muted/50">
										<td className="py-3">
											<a
												href={`/projects/${projectId}/runs/${run.id}`}
												className="font-mono text-primary hover:underline"
											>
												{run.id.slice(0, 8)}
											</a>
										</td>
										<td className="py-3">
											<Badge
												variant={statusVariant(run.status)}
												className={run.status === "running" ? "animate-pulse" : ""}
											>
												{run.status}
											</Badge>
										</td>
										<td className="py-3">
											{run.completedCases}/{run.totalCases}
											{run.failedCases > 0 && (
												<span className="text-destructive ml-1">({run.failedCases} failed)</span>
											)}
										</td>
										<td className="py-3 font-mono">
											{run.totalCost != null ? `$${run.totalCost.toFixed(4)}` : "-"}
										</td>
										<td className="py-3">
											{run.avgLatencyMs != null ? `${run.avgLatencyMs.toFixed(0)}ms` : "-"}
										</td>
										<td className="py-3 text-muted-foreground">
											{new Date(run.createdAt).toLocaleString()}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{runs.length === 0 && (
						<p className="text-center text-muted-foreground py-8">
							No runs yet. Use <code className="rounded bg-muted px-2 py-1">llmbench run</code> to
							start.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
