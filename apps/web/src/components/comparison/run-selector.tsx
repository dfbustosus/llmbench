"use client";

import { Label, Select } from "@llmbench/ui";
import { useState } from "react";
import { trpc } from "@/trpc/client";

interface RunSelectorProps {
	label: string;
	value: string;
	onChange: (runId: string) => void;
}

export function RunSelector({ label, value, onChange }: RunSelectorProps) {
	const [selectedProject, setSelectedProject] = useState("");

	const projectsQuery = trpc.project.list.useQuery();
	const runsQuery = trpc.evalRun.listByProject.useQuery(
		{ projectId: selectedProject },
		{ enabled: !!selectedProject },
	);

	const projects = projectsQuery.data ?? [];
	const runs = runsQuery.data ?? [];

	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<div className="space-y-2">
				<Select
					value={selectedProject}
					onChange={(e) => {
						setSelectedProject(e.target.value);
						onChange("");
					}}
					aria-label={`${label} - select project`}
				>
					<option value="">Select project...</option>
					{projects.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</Select>
				<Select
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={!selectedProject}
					aria-label={`${label} - select run`}
				>
					<option value="">Select run...</option>
					{runs.map((r) => (
						<option key={r.id} value={r.id}>
							{r.id.slice(0, 8)} — {r.status} — {new Date(r.createdAt).toLocaleDateString()}
						</option>
					))}
				</Select>
			</div>
		</div>
	);
}
