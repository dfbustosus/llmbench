import { cn } from "../lib/utils.js";

interface CostDisplayProps {
	cost: number;
	className?: string;
}

export function CostDisplay({ cost, className }: CostDisplayProps) {
	const formatted =
		cost < 0.01 ? `$${cost.toFixed(6)}` : cost < 1 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;

	return <span className={cn("font-mono text-sm tabular-nums", className)}>{formatted}</span>;
}
