"use client";

import { Badge, CostDisplay } from "@llmbench/ui";
import { trpc } from "@/trpc/client";

function statusVariant(status: string) {
	switch (status) {
		case "completed":
			return "success" as const;
		case "failed":
			return "destructive" as const;
		default:
			return "secondary" as const;
	}
}

export function RecentRunsTable({ projectId }: { projectId: string }) {
	const runsQuery = trpc.evalRun.listByProject.useQuery({
		projectId,
		limit: 10,
	});

	const runs = runsQuery.data ?? [];

	if (runs.length === 0) {
		return <p className="text-muted-foreground text-sm">No runs yet.</p>;
	}

	return (
		<table className="w-full text-sm">
			<thead>
				<tr className="border-b">
					<th className="py-2 text-left font-medium">Run</th>
					<th className="py-2 text-left font-medium">Status</th>
					<th className="py-2 text-left font-medium">Cases</th>
					<th className="py-2 text-left font-medium">Cost</th>
					<th className="py-2 text-left font-medium">Created</th>
				</tr>
			</thead>
			<tbody>
				{runs.map((run) => (
					<tr key={run.id} className="border-b hover:bg-muted/50">
						<td className="py-2 font-mono">{run.id.slice(0, 8)}</td>
						<td className="py-2">
							<Badge variant={statusVariant(run.status)}>{run.status}</Badge>
						</td>
						<td className="py-2">
							{run.completedCases}/{run.totalCases}
						</td>
						<td className="py-2">
							{run.totalCost != null ? <CostDisplay cost={run.totalCost} /> : "-"}
						</td>
						<td className="py-2 text-muted-foreground">
							{new Date(run.createdAt).toLocaleDateString()}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
