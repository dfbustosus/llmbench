"use client";

import { Input, Label } from "@llmbench/ui";
import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { trpc } from "@/trpc/client";

interface CreateProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | null>(null);

	const utils = trpc.useUtils();
	const createMutation = trpc.project.create.useMutation({
		onSuccess: () => {
			utils.project.list.invalidate();
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
			name: name.trim(),
			description: description.trim() || undefined,
		});
	};

	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Create Project"
			submitLabel="Create"
			pendingLabel="Creating..."
			isPending={createMutation.isPending}
			isValid={!!name.trim()}
			error={error}
			onSubmit={handleSubmit}
		>
			<div className="space-y-2">
				<Label htmlFor="name">Name</Label>
				<Input
					id="name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="My Evaluation Project"
					required
					autoFocus
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="description">Description (optional)</Label>
				<Input
					id="description"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="A brief description..."
				/>
			</div>
		</FormDialog>
	);
}
