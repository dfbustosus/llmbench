"use client";

import type { EvalResult } from "@llmbench/types";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface ScoreDistributionChartProps {
	runId: string;
	results: EvalResult[];
}

export function ScoreDistributionChart({ results }: ScoreDistributionChartProps) {
	// Build score distribution buckets from 0.0 to 1.0
	const buckets = [
		{ range: "0.0-0.2", min: 0, max: 0.2, count: 0 },
		{ range: "0.2-0.4", min: 0.2, max: 0.4, count: 0 },
		{ range: "0.4-0.6", min: 0.4, max: 0.6, count: 0 },
		{ range: "0.6-0.8", min: 0.6, max: 0.8, count: 0 },
		{ range: "0.8-1.0", min: 0.8, max: 1.01, count: 0 },
	];

	// If results have score data, use it; otherwise fall back to error-based scoring
	let hasScores = false;

	for (const r of results) {
		// EvalResult may carry scores from the tRPC join
		const resultScores = (r as unknown as Record<string, unknown>).scores as
			| Array<{ value: number }>
			| undefined;

		if (resultScores && resultScores.length > 0) {
			hasScores = true;
			// Average the scores for this result
			const avg = resultScores.reduce((sum, s) => sum + s.value, 0) / resultScores.length;
			for (const bucket of buckets) {
				if (avg >= bucket.min && avg < bucket.max) {
					bucket.count++;
					break;
				}
			}
		} else {
			// Binary score based on error presence: 1.0 if no error, 0.0 if error
			const score = r.error ? 0 : 1;
			if (score === 0) {
				buckets[0].count++;
			} else {
				buckets[4].count++;
			}
		}
	}

	const chartData = buckets.map((b) => ({ range: b.range, count: b.count }));

	const colors = [
		"hsl(0, 72%, 51%)",
		"hsl(25, 95%, 53%)",
		"hsl(45, 93%, 47%)",
		"hsl(80, 60%, 45%)",
		"hsl(142, 76%, 36%)",
	];

	return (
		<div>
			<p className="text-xs text-muted-foreground mb-2">
				{hasScores ? "Score" : "Success rate"} distribution across {results.length} results
			</p>
			<ResponsiveContainer width="100%" height={250}>
				<BarChart data={chartData}>
					<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
					<XAxis dataKey="range" className="text-xs" />
					<YAxis className="text-xs" allowDecimals={false} />
					<Tooltip />
					<Bar dataKey="count" radius={[4, 4, 0, 0]}>
						{chartData.map((_entry, index) => (
							<Cell key={`cell-${index}`} fill={colors[index]} />
						))}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
