"use client";

import type { EvalRun } from "@llmbench/types";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface ScoreTrendChartProps {
	runs: EvalRun[];
}

export function ScoreTrendChart({ runs }: ScoreTrendChartProps) {
	const data = [...runs].reverse().map((run, i) => ({
		run: i + 1,
		label: run.id.slice(0, 6),
		successRate:
			run.totalCases > 0 ? ((run.completedCases - run.failedCases) / run.totalCases) * 100 : 0,
		cost: run.totalCost ?? 0,
		latency: run.avgLatencyMs ?? 0,
	}));

	if (data.length < 2) return null;

	return (
		<ResponsiveContainer width="100%" height={300}>
			<LineChart data={data}>
				<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
				<XAxis dataKey="label" className="text-xs" />
				<YAxis domain={[0, 100]} className="text-xs" />
				<Tooltip />
				<Line
					type="monotone"
					dataKey="successRate"
					stroke="hsl(142, 76%, 36%)"
					strokeWidth={2}
					name="Success Rate (%)"
					dot={{ r: 4 }}
				/>
			</LineChart>
		</ResponsiveContainer>
	);
}
