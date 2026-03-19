"use client";

import type { ScorerComparison } from "@llmbench/types";
import { Card, CardContent, CardHeader, CardTitle } from "@llmbench/ui";
import { deltaColorClass } from "./format-delta";

interface ScorerComparisonTableProps {
	comparisons: ScorerComparison[];
}

export function ScorerComparisonTable({ comparisons }: ScorerComparisonTableProps) {
	if (comparisons.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Scorer Comparison</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b">
								<th className="py-3 text-left font-medium">Scorer</th>
								<th className="py-3 text-left font-medium">Avg Score A</th>
								<th className="py-3 text-left font-medium">Avg Score B</th>
								<th className="py-3 text-left font-medium">Delta</th>
								<th className="py-3 text-left font-medium">% Change</th>
							</tr>
						</thead>
						<tbody>
							{comparisons.map((c) => {
								const colorClass = deltaColorClass(c.delta);
								return (
									<tr key={c.scorerName} className="border-b hover:bg-muted/50">
										<td className="py-3 font-medium">{c.scorerName}</td>
										<td className="py-3 font-mono">{c.avgScoreA.toFixed(3)}</td>
										<td className="py-3 font-mono">{c.avgScoreB.toFixed(3)}</td>
										<td className={`py-3 font-mono ${colorClass}`}>
											{c.delta > 0 ? "+" : ""}
											{c.delta.toFixed(3)}
										</td>
										<td className={`py-3 font-mono ${colorClass}`}>
											{c.percentChange > 0 ? "+" : ""}
											{c.percentChange.toFixed(1)}%
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}
