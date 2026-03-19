"use client";

import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Textarea,
} from "@llmbench/ui";
import { useState } from "react";
import { trpc } from "@/trpc/client";

interface AddTestCaseDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	datasetId: string;
}

export function AddTestCaseDialog({ open, onOpenChange, datasetId }: AddTestCaseDialogProps) {
	const [input, setInput] = useState("");
	const [expected, setExpected] = useState("");
	const [tags, setTags] = useState("");
	const [error, setError] = useState<string | null>(null);

	const utils = trpc.useUtils();
	const addMutation = trpc.dataset.addTestCase.useMutation({
		onSuccess: () => {
			utils.dataset.getTestCases.invalidate(datasetId);
			setInput("");
			setExpected("");
			setTags("");
			setError(null);
		},
		onError: (err) => setError(err.message),
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || !expected.trim()) return;
		setError(null);
		const parsedTags = tags
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		addMutation.mutate({
			datasetId,
			input: input.trim(),
			expected: expected.trim(),
			tags: parsedTags.length > 0 ? parsedTags : undefined,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Add Test Case</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="tc-input">Input</Label>
							<Textarea
								id="tc-input"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								placeholder="Test case input..."
								required
								rows={3}
								autoFocus
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="tc-expected">Expected Output</Label>
							<Textarea
								id="tc-expected"
								value={expected}
								onChange={(e) => setExpected(e.target.value)}
								placeholder="Expected output..."
								required
								rows={3}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="tc-tags">Tags (optional, comma-separated)</Label>
							<Input
								id="tc-tags"
								value={tags}
								onChange={(e) => setTags(e.target.value)}
								placeholder="tag1, tag2, tag3"
							/>
						</div>
					</div>
					{error && <p className="text-sm text-destructive pb-2">{error}</p>}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={addMutation.isPending || !input.trim() || !expected.trim()}
						>
							{addMutation.isPending ? "Adding..." : "Add Test Case"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
