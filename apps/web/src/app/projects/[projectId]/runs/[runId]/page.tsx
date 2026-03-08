"use client";

import {
	Badge,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	CostDisplay,
} from "@llmbench/ui";
import { use, useMemo } from "react";
import { LatencyChart } from "@/components/charts/latency-chart";
import { ScoreDistributionChart } from "@/components/charts/score-distribution-chart";
import { trpc } from "@/trpc/client";

export default function RunDetailPage({
	params,
}: {
	params: Promise<{ projectId: string; runId: string }>;
}) {
	const { projectId, runId } = use(params);
	const runQuery = trpc.evalRun.getById.useQuery(runId);
	const resultsQuery = trpc.evalRun.getResults.useQuery(runId);
	const scoresQuery = trpc.evalRun.getScoresByRunId.useQuery(runId);
	const providersQuery = trpc.evalRun.getProvidersByProject.useQuery(projectId);

	const run = runQuery.data;
	const results = resultsQuery.data ?? [];
	const scoresByResultId = scoresQuery.data ?? {};
	const providers = providersQuery.data ?? [];

	const providerMap = useMemo(() => {
		const map: Record<string, { name: string; model: string }> = {};
		for (const p of providers) {
			map[p.id] = { name: p.name, model: p.model };
		}
		return map;
	}, [providers]);

	// Collect unique scorer names across all results
	const scorerNames = useMemo(() => {
		const names = new Set<string>();
		for (const scoreList of Object.values(scoresByResultId)) {
			for (const s of scoreList) {
				names.add(s.scorerName);
			}
		}
		return Array.from(names).sort();
	}, [scoresByResultId]);

	// Check if this run has multiple providers
	const hasMultipleProviders = useMemo(() => {
		const providerIds = new Set(results.map((r) => r.providerId));
		return providerIds.size > 1;
	}, [results]);

	if (runQuery.isLoading) {
		return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
	}

	if (runQuery.isError) {
		return (
			<div className="text-center py-12 text-destructive">
				Error loading run: {runQuery.error.message}
			</div>
		);
	}

	if (!run) {
		return (
			<div className="text-center py-12 text-muted-foreground">
				Run not found.{" "}
				<a href={`/projects/${projectId}/runs`} className="underline hover:text-foreground">
					Back to runs
				</a>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div className="flex items-center gap-4">
				<a
					href={`/projects/${projectId}/runs`}
					className="text-muted-foreground hover:text-foreground"
				>
					Runs
				</a>
				<span className="text-muted-foreground">/</span>
				<h1 className="text-2xl font-bold font-mono">{run.id.slice(0, 8)}</h1>
				<Badge
					variant={
						run.status === "completed"
							? "success"
							: run.status === "failed"
								? "destructive"
								: "secondary"
					}
				>
					{run.status}
				</Badge>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card>
					<CardHeader>
						<CardDescription>Completed</CardDescription>
						<CardTitle className="text-2xl">
							{run.completedCases}/{run.totalCases}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>Failed</CardDescription>
						<CardTitle className="text-2xl text-destructive">{run.failedCases}</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>Total Cost</CardDescription>
						<CardTitle className="text-2xl">
							{run.totalCost != null ? <CostDisplay cost={run.totalCost} /> : "-"}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>Avg Latency</CardDescription>
						<CardTitle className="text-2xl">
							{run.avgLatencyMs != null ? `${run.avgLatencyMs.toFixed(0)}ms` : "-"}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			{/* Charts */}
			{results.length > 0 && (
				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>Latency Distribution</CardTitle>
						</CardHeader>
						<CardContent>
							<LatencyChart
								results={results}
								providerMap={hasMultipleProviders ? providerMap : undefined}
							/>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Score Distribution</CardTitle>
						</CardHeader>
						<CardContent>
							<ScoreDistributionChart
								runId={runId}
								results={results}
								scoresByResultId={scoresByResultId}
							/>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Results Table */}
			<Card>
				<CardHeader>
					<CardTitle>Results</CardTitle>
					<CardDescription>{results.length} results</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b">
									<th className="py-3 text-left font-medium">#</th>
									{hasMultipleProviders && <th className="py-3 text-left font-medium">Provider</th>}
									<th className="py-3 text-left font-medium">Input</th>
									<th className="py-3 text-left font-medium">Expected</th>
									<th className="py-3 text-left font-medium">Output</th>
									{scorerNames.map((name) => (
										<th key={name} className="py-3 text-left font-medium">
											{name}
										</th>
									))}
									<th className="py-3 text-left font-medium">Latency</th>
									<th className="py-3 text-left font-medium">Cost</th>
								</tr>
							</thead>
							<tbody>
								{results.map((result, i) => {
									const resultScores = scoresByResultId[result.id] ?? [];
									const scoreMap: Record<string, number> = {};
									for (const s of resultScores) {
										scoreMap[s.scorerName] = s.value;
									}
									const provider = providerMap[result.providerId];

									return (
										<tr key={result.id} className="border-b hover:bg-muted/50">
											<td className="py-3 text-muted-foreground">{i + 1}</td>
											{hasMultipleProviders && (
												<td className="py-3">
													<div className="flex flex-col">
														<span className="font-medium">
															{provider?.name ?? result.providerId.slice(0, 8)}
														</span>
														{provider?.model && (
															<span className="text-xs text-muted-foreground">
																{provider.model}
															</span>
														)}
													</div>
												</td>
											)}
											<td className="py-3 max-w-[200px] truncate">{result.input}</td>
											<td className="py-3 max-w-[150px] truncate">{result.expected}</td>
											<td className="py-3 max-w-[200px] truncate">
												{result.error ? (
													<span className="text-destructive">{result.error}</span>
												) : (
													result.output
												)}
											</td>
											{scorerNames.map((name) => (
												<td key={name} className="py-3 font-mono">
													{scoreMap[name] !== undefined ? (
														<span
															className={
																scoreMap[name] >= 0.8
																	? "text-green-600 dark:text-green-400"
																	: scoreMap[name] >= 0.5
																		? "text-yellow-600 dark:text-yellow-400"
																		: "text-red-600 dark:text-red-400"
															}
														>
															{scoreMap[name].toFixed(2)}
														</span>
													) : (
														<span className="text-muted-foreground">-</span>
													)}
												</td>
											))}
											<td className="py-3 font-mono">{result.latencyMs.toFixed(0)}ms</td>
											<td className="py-3">
												{result.cost != null ? <CostDisplay cost={result.cost} /> : "-"}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
