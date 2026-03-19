import * as React from "react";
import { cn } from "../lib/utils.js";

interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			role="dialog"
			aria-modal="true"
			onKeyDown={(e) => {
				if (e.key === "Escape") onOpenChange(false);
			}}
		>
			<div
				className="fixed inset-0 bg-black/80 animate-in fade-in-0"
				onClick={() => onOpenChange(false)}
				aria-hidden="true"
			/>
			<div className="relative z-50">{children}</div>
		</div>
	);
}
Dialog.displayName = "Dialog";

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					"w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg animate-in fade-in-0 zoom-in-95",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		);
	},
);
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
			{...props}
		/>
	);
}
DialogHeader.displayName = "DialogHeader";

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
	({ className, ...props }, ref) => {
		return (
			<h2
				ref={ref}
				className={cn("text-lg font-semibold leading-none tracking-tight", className)}
				{...props}
			/>
		);
	},
);
DialogTitle.displayName = "DialogTitle";

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
	return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
DialogDescription.displayName = "DialogDescription";

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
			{...props}
		/>
	);
}
DialogFooter.displayName = "DialogFooter";

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
