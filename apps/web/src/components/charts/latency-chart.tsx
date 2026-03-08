"use client";

import type { EvalResult } from "@llmbench/types";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface LatencyChartProps {
	results: EvalResult[];
	providerMap?: Record<string, { name: string; model: string }>;
}

export function LatencyChart({ results, providerMap }: LatencyChartProps) {
	const data = results.map((r, i) => ({
		index: i + 1,
		latency: Math.round(r.latencyMs),
		label: providerMap ? `#${i + 1} (${providerMap[r.providerId]?.name ?? "?"})` : `#${i + 1}`,
	}));

	return (
		<ResponsiveContainer width="100%" height={250}>
			<BarChart data={data}>
				<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
				<XAxis dataKey="label" className="text-xs" />
				<YAxis className="text-xs" unit="ms" />
				<Tooltip formatter={(value: number) => [`${value}ms`, "Latency"]} />
				<Bar dataKey="latency" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
			</BarChart>
		</ResponsiveContainer>
	);
}
