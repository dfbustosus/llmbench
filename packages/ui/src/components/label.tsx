import * as React from "react";
import { cn } from "../lib/utils.js";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
	({ className, ...props }, ref) => {
		return (
			// biome-ignore lint/a11y/noLabelWithoutControl: generic component; consumer provides htmlFor
			<label
				ref={ref}
				className={cn(
					"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
					className,
				)}
				{...props}
			/>
		);
	},
);
Label.displayName = "Label";

export { Label };
