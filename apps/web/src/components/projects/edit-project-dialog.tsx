"use client";

import { Input, Label } from "@llmbench/ui";
import { useEffect, useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { trpc } from "@/trpc/client";

interface EditProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	project: { id: string; name: string; description?: string | null };
}

export function EditProjectDialog({ open, onOpenChange, project }: EditProjectDialogProps) {
	const [name, setName] = useState(project.name);
	const [description, setDescription] = useState(project.description ?? "");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setName(project.name);
			setDescription(project.description ?? "");
			setError(null);
		}
	}, [open, project.name, project.description]);

	const utils = trpc.useUtils();
	const updateMutation = trpc.project.update.useMutation({
		onSuccess: () => {
			utils.project.list.invalidate();
			onOpenChange(false);
		},
		onError: (err) => setError(err.message),
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) return;
		setError(null);
		updateMutation.mutate({
			id: project.id,
			name: name.trim(),
			description: description.trim() || undefined,
		});
	};

	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Edit Project"
			submitLabel="Save"
			pendingLabel="Saving..."
			isPending={updateMutation.isPending}
			isValid={!!name.trim()}
			error={error}
			onSubmit={handleSubmit}
		>
			<div className="space-y-2">
				<Label htmlFor="edit-name">Name</Label>
				<Input
					id="edit-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
					autoFocus
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="edit-description">Description (optional)</Label>
				<Input
					id="edit-description"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</div>
		</FormDialog>
	);
}
