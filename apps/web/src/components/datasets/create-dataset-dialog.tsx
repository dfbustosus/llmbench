"use client";

import { Input, Label } from "@llmbench/ui";
import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { trpc } from "@/trpc/client";

interface CreateDatasetDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
}

export function CreateDatasetDialog({ open, onOpenChange, projectId }: CreateDatasetDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | null>(null);

	const utils = trpc.useUtils();
	const createMutation = trpc.dataset.create.useMutation({
		onSuccess: () => {
			utils.dataset.listByProject.invalidate(projectId);
			setName("");
			setDescription("");
			setError(null);
			onOpenChange(false);
		},
		onError: (err) => setError(err.message),
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) return;
		setError(null);
		createMutation.mutate({
			projectId,
			name: name.trim(),
			description: description.trim() || undefined,
		});
	};

	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Create Dataset"
			submitLabel="Create"
			pendingLabel="Creating..."
			isPending={createMutation.isPending}
			isValid={!!name.trim()}
			error={error}
			onSubmit={handleSubmit}
		>
			<div className="space-y-2">
				<Label htmlFor="dataset-name">Name</Label>
				<Input
					id="dataset-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="My Dataset"
					required
					autoFocus
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="dataset-desc">Description (optional)</Label>
				<Input
					id="dataset-desc"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="A brief description..."
				/>
			</div>
		</FormDialog>
	);
}
