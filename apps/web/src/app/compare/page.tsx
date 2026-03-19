"use client";

import { Button, Card, CardContent } from "@llmbench/ui";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ComparisonSummary } from "@/components/comparison/comparison-summary";
import { RegressionTable } from "@/components/comparison/regression-table";
import { RunSelector } from "@/components/comparison/run-selector";
import { ScorerComparisonTable } from "@/components/comparison/scorer-comparison-table";
import { trpc } from "@/trpc/client";

function CompareContent() {
	const searchParams = useSearchParams();
	const [runIdA, setRunIdA] = useState(searchParams.get("runIdA") ?? "");
	const [runIdB, setRunIdB] = useState(searchParams.get("runIdB") ?? "");
	const initialA = searchParams.get("runIdA") ?? "";
	const initialB = searchParams.get("runIdB") ?? "";
	const [compareIds, setCompareIds] = useState<{ runIdA: string; runIdB: string } | null>(
		initialA && initialB ? { runIdA: initialA, runIdB: initialB } : null,
	);

	const comparisonQuery = trpc.comparison.compare.useQuery(
		compareIds ?? { runIdA: "", runIdB: "" },
		{ enabled: !!compareIds },
	);

	const handleCompare = () => {
		if (runIdA && runIdB) {
			setCompareIds({ runIdA, runIdB });
			const url = new URL(window.location.href);
			url.searchParams.set("runIdA", runIdA);
			url.searchParams.set("runIdB", runIdB);
			window.history.replaceState({}, "", url.toString());
		}
	};

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Compare Runs</h1>
				<p className="text-muted-foreground">Compare two evaluation runs side by side</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<RunSelector label="Run A" value={runIdA} onChange={setRunIdA} />
				<RunSelector label="Run B" value={runIdB} onChange={setRunIdB} />
			</div>

			<Button onClick={handleCompare} disabled={!runIdA || !runIdB}>
				Compare
			</Button>

			{comparisonQuery.isLoading && (
				<div className="text-center py-12 text-muted-foreground">Comparing runs...</div>
			)}

			{comparisonQuery.isError && (
				<Card>
					<CardContent className="pt-6 text-center py-12 text-destructive">
						Error: {comparisonQuery.error.message}
					</CardContent>
				</Card>
			)}

			{comparisonQuery.data && (
				<div className="space-y-6">
					<ComparisonSummary result={comparisonQuery.data} />
					<ScorerComparisonTable comparisons={comparisonQuery.data.scorerComparisons} />
					<RegressionTable regressions={comparisonQuery.data.regressions} />
				</div>
			)}
		</div>
	);
}

export default function ComparePage() {
	return (
		<Suspense fallback={<div className="text-center py-12 text-muted-foreground">Loading...</div>}>
			<CompareContent />
		</Suspense>
	);
}
