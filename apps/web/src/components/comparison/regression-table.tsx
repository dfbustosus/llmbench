"use client";

import type { Regression } from "@llmbench/types";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@llmbench/ui";

interface RegressionTableProps {
	regressions: Regression[];
}

export function RegressionTable({ regressions }: RegressionTableProps) {
	if (regressions.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Regressions ({regressions.length})</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b">
								<th className="py-3 text-left font-medium">Test Case</th>
								<th className="py-3 text-left font-medium">Scorer</th>
								<th className="py-3 text-left font-medium">Score A</th>
								<th className="py-3 text-left font-medium">Score B</th>
								<th className="py-3 text-left font-medium">Delta</th>
								<th className="py-3 text-left font-medium">Severity</th>
							</tr>
						</thead>
						<tbody>
							{regressions.map((r) => (
								<tr
									key={`${r.testCaseId}-${r.scorerName}-${r.delta}`}
									className="border-b hover:bg-muted/50"
								>
									<td className="py-3 font-mono max-w-[150px] truncate">
										{r.testCaseId.slice(0, 12)}
									</td>
									<td className="py-3">{r.scorerName}</td>
									<td className="py-3 font-mono">{r.scoreA.toFixed(3)}</td>
									<td className="py-3 font-mono">{r.scoreB.toFixed(3)}</td>
									<td className="py-3 font-mono text-red-600 dark:text-red-400">
										{r.delta.toFixed(3)}
									</td>
									<td className="py-3">
										<Badge
											variant={
												r.severity === "high"
													? "destructive"
													: r.severity === "medium"
														? "warning"
														: "secondary"
											}
										>
											{r.severity}
										</Badge>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}
