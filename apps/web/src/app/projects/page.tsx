"use client";

import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	ConfirmDialog,
} from "@llmbench/ui";
import { useState } from "react";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { trpc } from "@/trpc/client";

export default function ProjectsPage() {
	const projectsQuery = trpc.project.list.useQuery();
	const projects = projectsQuery.data ?? [];

	const [createOpen, setCreateOpen] = useState(false);
	const [editProject, setEditProject] = useState<{
		id: string;
		name: string;
		description?: string;
	} | null>(null);
	const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const utils = trpc.useUtils();
	const deleteMutation = trpc.project.delete.useMutation({
		onSuccess: () => {
			utils.project.list.invalidate();
			setDeleteProjectId(null);
			setDeleteError(null);
		},
		onError: (err) => setDeleteError(err.message),
	});

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Projects</h1>
					<p className="text-muted-foreground">Manage your evaluation projects</p>
				</div>
				<Button onClick={() => setCreateOpen(true)}>New Project</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{projects.map((project) => (
					<Card key={project.id} className="hover:shadow-md transition-shadow">
						<CardHeader>
							<CardTitle>
								<a href={`/projects/${project.id}/runs`} className="hover:underline">
									{project.name}
								</a>
							</CardTitle>
							{project.description && <CardDescription>{project.description}</CardDescription>}
						</CardHeader>
						<CardContent>
							<div className="flex justify-between items-center text-sm text-muted-foreground">
								<span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
								<div className="flex gap-1">
									<Button variant="ghost" size="sm" onClick={() => setEditProject(project)}>
										Edit
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="text-destructive hover:text-destructive"
										onClick={() => setDeleteProjectId(project.id)}
									>
										Delete
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{projects.length === 0 && !projectsQuery.isLoading && (
				<Card>
					<CardContent className="pt-6 text-center py-12">
						<h3 className="text-lg font-semibold">No projects yet</h3>
						<p className="text-muted-foreground mt-2">
							Click <strong>New Project</strong> above, or run{" "}
							<code className="rounded bg-muted px-2 py-1">llmbench init</code> followed by{" "}
							<code className="rounded bg-muted px-2 py-1">llmbench run</code> to get started.
						</p>
					</CardContent>
				</Card>
			)}

			<CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
			{editProject && (
				<EditProjectDialog
					open={!!editProject}
					onOpenChange={(open) => {
						if (!open) setEditProject(null);
					}}
					project={editProject}
				/>
			)}
			<ConfirmDialog
				open={!!deleteProjectId}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteProjectId(null);
						setDeleteError(null);
					}
				}}
				title="Delete Project"
				description="This will permanently delete the project and all its datasets, runs, and results."
				onConfirm={() => {
					if (deleteProjectId) deleteMutation.mutate(deleteProjectId);
				}}
				loading={deleteMutation.isPending}
				error={deleteError}
			/>
		</div>
	);
}
