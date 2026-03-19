"use client";

import type { ComparisonResult } from "@llmbench/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@llmbench/ui";
import { deltaColorClass, formatDelta } from "./format-delta";

interface ComparisonSummaryProps {
	result: ComparisonResult;
}

export function ComparisonSummary({ result }: ComparisonSummaryProps) {
	const avgScorerDelta =
		result.scorerComparisons.length > 0
			? result.scorerComparisons.reduce((sum, s) => sum + s.delta, 0) /
				result.scorerComparisons.length
			: 0;

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<Card>
				<CardHeader>
					<CardDescription>Avg Score Delta</CardDescription>
					<CardTitle className={`text-2xl ${deltaColorClass(avgScorerDelta)}`}>
						{formatDelta(avgScorerDelta)}
					</CardTitle>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader>
					<CardDescription>Cost Delta</CardDescription>
					<CardTitle className={`text-2xl ${deltaColorClass(result.costComparison.delta, true)}`}>
						{formatDelta(result.costComparison.delta, "")} (
						{formatDelta(result.costComparison.percentChange, "%")})
					</CardTitle>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader>
					<CardDescription>Latency Delta</CardDescription>
					<CardTitle
						className={`text-2xl ${deltaColorClass(result.latencyComparison.delta, true)}`}
					>
						{formatDelta(result.latencyComparison.delta, "ms")} (
						{formatDelta(result.latencyComparison.percentChange, "%")})
					</CardTitle>
				</CardHeader>
			</Card>
		</div>
	);
}
