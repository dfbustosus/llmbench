"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@llmbench/ui";
import { trpc } from "@/trpc/client";

export default function ProjectsPage() {
	const projectsQuery = trpc.project.list.useQuery();
	const projects = projectsQuery.data ?? [];

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Projects</h1>
					<p className="text-muted-foreground">Manage your evaluation projects</p>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{projects.map((project) => (
					<a key={project.id} href={`/projects/${project.id}/runs`}>
						<Card className="hover:shadow-md transition-shadow cursor-pointer">
							<CardHeader>
								<CardTitle>{project.name}</CardTitle>
								{project.description && <CardDescription>{project.description}</CardDescription>}
							</CardHeader>
							<CardContent>
								<div className="flex justify-between text-sm text-muted-foreground">
									<span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
								</div>
							</CardContent>
						</Card>
					</a>
				))}
			</div>

			{projects.length === 0 && !projectsQuery.isLoading && (
				<Card>
					<CardContent className="pt-6 text-center py-12">
						<h3 className="text-lg font-semibold">No projects yet</h3>
						<p className="text-muted-foreground mt-2">
							Run <code className="rounded bg-muted px-2 py-1">llmbench init</code> followed by{" "}
							<code className="rounded bg-muted px-2 py-1">llmbench run</code> to create your first
							project.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
