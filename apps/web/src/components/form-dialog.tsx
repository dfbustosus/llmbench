"use client";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@llmbench/ui";

interface FormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	submitLabel: string;
	pendingLabel: string;
	isPending: boolean;
	isValid: boolean;
	error: string | null;
	onSubmit: (e: React.FormEvent) => void;
	children: React.ReactNode;
}

export function FormDialog({
	open,
	onOpenChange,
	title,
	description,
	submitLabel,
	pendingLabel,
	isPending,
	isValid,
	error,
	onSubmit,
	children,
}: FormDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={onSubmit}>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						{description && <DialogDescription>{description}</DialogDescription>}
					</DialogHeader>
					<div className="space-y-4 py-4">{children}</div>
					{error && <p className="text-sm text-destructive pb-2">{error}</p>}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending || !isValid}>
							{isPending ? pendingLabel : submitLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
