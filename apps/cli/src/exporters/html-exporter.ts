import type { ComparisonResult } from "@llmbench/types";
import type { EvalExportData, RunExportData } from "./index.js";

export function htmlEscape(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function scoreClass(value: number): string {
	if (value >= 0.8) return "score-high";
	if (value >= 0.5) return "score-mid";
	return "score-low";
}

const CSS_STYLES = `
	* { margin: 0; padding: 0; box-sizing: border-box; }
	body {
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
		background: #f8f9fa; color: #1a202c; padding: 2rem;
	}
	.container { max-width: 1200px; margin: 0 auto; }
	h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #2d3748; }
	h2 { font-size: 1.2rem; margin: 1.5rem 0 0.75rem; color: #2d3748; }
	.card {
		background: #fff; border-radius: 8px; padding: 1.25rem;
		box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1rem;
	}
	.stats { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; }
	.stat {
		background: #fff; border-radius: 8px; padding: 1rem 1.25rem;
		box-shadow: 0 1px 3px rgba(0,0,0,0.1); min-width: 140px;
	}
	.stat-label { font-size: 0.75rem; color: #718096; text-transform: uppercase; }
	.stat-value { font-size: 1.25rem; font-weight: 600; margin-top: 0.25rem; }
	.badges { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.5rem; }
	.badge {
		display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px;
		font-size: 0.85rem; font-weight: 500;
	}
	.badge.score-high { background: #c6f6d5; color: #276749; }
	.badge.score-mid { background: #fefcbf; color: #975a16; }
	.badge.score-low { background: #fed7d7; color: #9b2c2c; }
	table {
		width: 100%; border-collapse: collapse; font-size: 0.875rem;
		overflow-x: auto; display: block;
	}
	thead { background: #2d3748; color: #fff; }
	th { padding: 0.625rem 0.75rem; text-align: left; font-weight: 600; white-space: nowrap; }
	td { padding: 0.625rem 0.75rem; border-bottom: 1px solid #e2e8f0; }
	tbody tr:nth-child(even) { background: #f7fafc; }
	tbody tr:hover { background: #edf2f7; }
	td.score-high { color: #276749; font-weight: 600; }
	td.score-mid { color: #975a16; font-weight: 600; }
	td.score-low { color: #9b2c2c; font-weight: 600; }
	td.delta-pos { color: #276749; }
	td.delta-neg { color: #9b2c2c; }
	.severity-high { color: #9b2c2c; font-weight: 600; }
	.severity-medium { color: #975a16; font-weight: 600; }
	.severity-low { color: #718096; }
	pre {
		background: #2d3748; color: #e2e8f0; padding: 1rem; border-radius: 6px;
		overflow-x: auto; font-size: 0.85rem; margin-bottom: 1rem; white-space: pre-wrap;
	}
	.error { color: #9b2c2c; }
`;

export function htmlDocument(title: string, bodyContent: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEscape(title)}</title>
<style>${CSS_STYLES}</style>
</head>
<body>
<div class="container">
<h1>${htmlEscape(title)}</h1>
${bodyContent}
</div>
</body>
</html>`;
}

export function exportRunToHtml(data: RunExportData): string {
	const { run, scorerAverages, results, scores } = data;

	// Summary stats
	let body = `<div class="stats">
<div class="stat"><div class="stat-label">Status</div><div class="stat-value">${htmlEscape(run.status)}</div></div>
<div class="stat"><div class="stat-label">Total Cases</div><div class="stat-value">${run.totalCases}</div></div>
<div class="stat"><div class="stat-label">Completed</div><div class="stat-value">${run.completedCases}</div></div>
<div class="stat"><div class="stat-label">Failed</div><div class="stat-value">${run.failedCases}</div></div>
${run.totalCost != null ? `<div class="stat"><div class="stat-label">Total Cost</div><div class="stat-value">$${run.totalCost.toFixed(4)}</div></div>` : ""}
${run.avgLatencyMs != null ? `<div class="stat"><div class="stat-label">Avg Latency</div><div class="stat-value">${run.avgLatencyMs.toFixed(0)}ms</div></div>` : ""}
</div>`;

	// Scorer averages
	const avgEntries = Object.entries(scorerAverages);
	if (avgEntries.length > 0) {
		body += `<h2>Scorer Averages</h2>\n<div class="badges">`;
		for (const [name, avg] of avgEntries) {
			body += `<span class="badge ${scoreClass(avg)}">${htmlEscape(name)}: ${avg.toFixed(3)}</span>`;
		}
		body += `</div>`;
	}

	// Collect scorer names
	const scorerNames = new Set<string>();
	for (const scoreList of scores.values()) {
		for (const s of scoreList) {
			scorerNames.add(s.scorerName);
		}
	}
	const scorerCols = [...scorerNames];

	// Results table
	body += `<h2>Results</h2>\n<div class="card"><table>
<thead><tr>
<th>#</th><th>Input</th><th>Expected</th><th>Output</th><th>Error</th><th>Latency</th><th>Cost</th>`;
	for (const name of scorerCols) {
		body += `<th>${htmlEscape(name)}</th>`;
	}
	body += `</tr></thead>\n<tbody>`;

	results.forEach((result, i) => {
		const resultScores = scores.get(result.id) ?? [];
		body += `<tr>
<td>${i + 1}</td>
<td>${htmlEscape(result.input)}</td>
<td>${htmlEscape(result.expected)}</td>
<td>${result.error ? "" : htmlEscape(result.output)}</td>
<td>${result.error ? `<span class="error">${htmlEscape(result.error)}</span>` : ""}</td>
<td>${result.latencyMs.toFixed(0)}ms</td>
<td>${result.cost != null ? `$${result.cost.toFixed(4)}` : "-"}</td>`;
		for (const name of scorerCols) {
			const s = resultScores.find((sc) => sc.scorerName === name);
			if (s) {
				body += `<td class="${scoreClass(s.value)}">${s.value.toFixed(3)}</td>`;
			} else {
				body += `<td>-</td>`;
			}
		}
		body += `</tr>`;
	});

	body += `</tbody></table></div>`;

	return htmlDocument("Evaluation Run Report", body);
}

export function exportCompareToHtml(data: { result: ComparisonResult }): string {
	const { result } = data;

	let body = `<p>Run A: <strong>${htmlEscape(result.runIdA)}</strong> vs Run B: <strong>${htmlEscape(result.runIdB)}</strong></p>`;

	// Score comparisons table
	body += `<h2>Score Comparisons</h2>\n<div class="card"><table>
<thead><tr><th>Scorer</th><th>Run A</th><th>Run B</th><th>Delta</th><th>Change</th></tr></thead>
<tbody>`;
	for (const sc of result.scorerComparisons) {
		const cls = sc.delta > 0 ? "delta-pos" : sc.delta < 0 ? "delta-neg" : "";
		body += `<tr>
<td>${htmlEscape(sc.scorerName)}</td>
<td>${sc.avgScoreA.toFixed(3)}</td>
<td>${sc.avgScoreB.toFixed(3)}</td>
<td class="${cls}">${sc.delta.toFixed(3)}</td>
<td class="${cls}">${sc.percentChange > 0 ? "+" : ""}${sc.percentChange.toFixed(1)}%</td>
</tr>`;
	}
	body += `</tbody></table></div>`;

	// Cost & Latency stats
	body += `<div class="stats">
<div class="stat"><div class="stat-label">Cost Run A</div><div class="stat-value">$${result.costComparison.totalCostA.toFixed(4)}</div></div>
<div class="stat"><div class="stat-label">Cost Run B</div><div class="stat-value">$${result.costComparison.totalCostB.toFixed(4)}</div></div>
<div class="stat"><div class="stat-label">Cost Delta</div><div class="stat-value">$${result.costComparison.delta.toFixed(4)}</div></div>
<div class="stat"><div class="stat-label">Latency Run A</div><div class="stat-value">${result.latencyComparison.avgLatencyA.toFixed(0)}ms</div></div>
<div class="stat"><div class="stat-label">Latency Run B</div><div class="stat-value">${result.latencyComparison.avgLatencyB.toFixed(0)}ms</div></div>
<div class="stat"><div class="stat-label">Latency Delta</div><div class="stat-value">${result.latencyComparison.delta.toFixed(0)}ms</div></div>
</div>`;

	// Regressions
	if (result.regressions.length > 0) {
		body += `<h2>Regressions (${result.regressions.length})</h2>\n<div class="card"><table>
<thead><tr><th>Test Case</th><th>Scorer</th><th>Score A</th><th>Score B</th><th>Delta</th><th>Severity</th></tr></thead>
<tbody>`;
		for (const reg of result.regressions) {
			body += `<tr>
<td>${htmlEscape(reg.testCaseId)}</td>
<td>${htmlEscape(reg.scorerName)}</td>
<td>${reg.scoreA.toFixed(3)}</td>
<td>${reg.scoreB.toFixed(3)}</td>
<td class="delta-neg">${reg.delta.toFixed(3)}</td>
<td class="severity-${reg.severity}">${reg.severity}</td>
</tr>`;
		}
		body += `</tbody></table></div>`;
	}

	return htmlDocument("Comparison Report", body);
}

export function exportEvalToHtml(data: EvalExportData): string {
	let body = `<h2>Prompt</h2>\n<pre>${htmlEscape(data.prompt)}</pre>`;

	if (data.expected !== undefined) {
		body += `<h2>Expected</h2>\n<pre>${htmlEscape(data.expected)}</pre>`;
	}

	// Collect scorer names
	const scorerNames = new Set<string>();
	for (const r of data.results) {
		for (const s of r.scores) {
			scorerNames.add(s.scorer);
		}
	}
	const scorerCols = [...scorerNames];

	// Results table
	body += `<h2>Results</h2>\n<div class="card"><table>
<thead><tr><th>Provider</th><th>Model</th><th>Output</th><th>Error</th><th>Latency</th><th>Cost</th>`;
	for (const name of scorerCols) {
		body += `<th>${htmlEscape(name)}</th>`;
	}
	body += `</tr></thead>\n<tbody>`;

	for (const r of data.results) {
		body += `<tr>
<td>${htmlEscape(r.provider)}</td>
<td>${htmlEscape(r.model)}</td>
<td>${r.error ? "" : htmlEscape(r.output)}</td>
<td>${r.error ? `<span class="error">${htmlEscape(r.error)}</span>` : ""}</td>
<td>${r.latencyMs.toFixed(0)}ms</td>
<td>${r.cost != null ? `$${r.cost.toFixed(6)}` : "-"}</td>`;
		for (const name of scorerCols) {
			const s = r.scores.find((sc) => sc.scorer === name);
			if (s) {
				body += `<td class="${scoreClass(s.value)}">${s.value.toFixed(3)}</td>`;
			} else {
				body += `<td>-</td>`;
			}
		}
		body += `</tr>`;
	}

	body += `</tbody></table></div>`;

	return htmlDocument("Quick Eval Report", body);
}
