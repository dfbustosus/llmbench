"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@llmbench/ui";
import { RecentRunsTable } from "@/components/dashboard/recent-runs-table";
import { trpc } from "@/trpc/client";

export default function DashboardPage() {
	const projectsQuery = trpc.project.list.useQuery();
	const projects = projectsQuery.data ?? [];

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground">Overview of your LLM evaluation projects</p>
			</div>

			{/* Stats Cards */}
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader>
						<CardDescription>Total Projects</CardDescription>
						<CardTitle className="text-3xl">{projects.length}</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>Active Projects</CardDescription>
						<CardTitle className="text-3xl">{projects.length}</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>Total Evaluations</CardDescription>
						<CardTitle className="text-3xl">-</CardTitle>
					</CardHeader>
				</Card>
			</div>

			{/* Projects */}
			<div className="grid gap-4 md:grid-cols-2">
				{projects.map((project) => (
					<a key={project.id} href={`/projects/${project.id}/runs`}>
						<Card className="hover:shadow-md transition-shadow cursor-pointer">
							<CardHeader>
								<CardTitle>{project.name}</CardTitle>
								{project.description && <CardDescription>{project.description}</CardDescription>}
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Created {new Date(project.createdAt).toLocaleDateString()}
								</p>
							</CardContent>
						</Card>
					</a>
				))}

				{projects.length === 0 && !projectsQuery.isLoading && (
					<Card className="col-span-2">
						<CardContent className="pt-6 text-center">
							<p className="text-muted-foreground">
								No projects yet. Run{" "}
								<code className="rounded bg-muted px-2 py-1">llmbench init</code> to get started.
							</p>
						</CardContent>
					</Card>
				)}
			</div>

			{/* Recent Runs */}
			{projects.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Recent Runs</CardTitle>
						<CardDescription>Latest evaluation runs across all projects</CardDescription>
					</CardHeader>
					<CardContent>
						<RecentRunsTable projectId={projects[0]?.id} />
					</CardContent>
				</Card>
			)}
		</div>
	);
}
