import { Badge } from "./badge.js";

interface ScoreBadgeProps {
	score: number;
	label?: string;
}

export function ScoreBadge({ score, label }: ScoreBadgeProps) {
	const variant = score >= 0.8 ? "success" : score >= 0.5 ? "warning" : "destructive";
	const displayScore = (score * 100).toFixed(0);

	return (
		<Badge variant={variant}>
			{label ? `${label}: ` : ""}
			{displayScore}%
		</Badge>
	);
}
