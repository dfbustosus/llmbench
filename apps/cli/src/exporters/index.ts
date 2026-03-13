import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import type { ComparisonResult, EvalResult, EvalRun, ScoreResult } from "@llmbench/types";
import type { EvalResultData } from "../commands/eval.js";
import { exportCompareToCsv, exportEvalToCsv, exportRunToCsv } from "./csv-exporter.js";
import { exportCompareToHtml, exportEvalToHtml, exportRunToHtml } from "./html-exporter.js";
import { exportCompareToJson, exportEvalToJson, exportRunToJson } from "./json-exporter.js";

export type ExportFormat = "json" | "csv" | "html";

export interface RunExportData {
	results: EvalResult[];
	scores: Map<string, ScoreResult[]>;
	run: EvalRun;
	scorerAverages: Record<string, number>;
}

export interface CompareExportData {
	result: ComparisonResult;
}

export interface EvalExportData {
	prompt: string;
	expected: string | undefined;
	results: EvalResultData[];
}

const FORMAT_MAP: Record<string, ExportFormat> = {
	".json": "json",
	".csv": "csv",
	".html": "html",
	".htm": "html",
};

export function detectFormat(filePath: string): ExportFormat {
	const ext = extname(filePath).toLowerCase();
	const format = FORMAT_MAP[ext];
	if (!format) {
		throw new Error(`Unsupported output format: "${ext}". Supported formats: .json, .csv, .html`);
	}
	return format;
}

function writeOutput(filePath: string, content: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, content, "utf-8");
}

export function exportRun(filePath: string, data: RunExportData): void {
	const format = detectFormat(filePath);
	let content: string;
	switch (format) {
		case "json":
			content = exportRunToJson(data);
			break;
		case "csv":
			content = exportRunToCsv(data);
			break;
		case "html":
			content = exportRunToHtml(data);
			break;
	}
	writeOutput(filePath, content);
}

export function exportCompare(filePath: string, data: CompareExportData): void {
	const format = detectFormat(filePath);
	let content: string;
	switch (format) {
		case "json":
			content = exportCompareToJson(data);
			break;
		case "csv":
			content = exportCompareToCsv(data);
			break;
		case "html":
			content = exportCompareToHtml(data);
			break;
	}
	writeOutput(filePath, content);
}

export function exportEval(filePath: string, data: EvalExportData): void {
	const format = detectFormat(filePath);
	let content: string;
	switch (format) {
		case "json":
			content = exportEvalToJson(data);
			break;
		case "csv":
			content = exportEvalToCsv(data);
			break;
		case "html":
			content = exportEvalToHtml(data);
			break;
	}
	writeOutput(filePath, content);
}
