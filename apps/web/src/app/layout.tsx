import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/trpc/provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
	title: "LLMBench - LLM Benchmarking Dashboard",
	description: "Beautiful LLM evaluation and benchmarking platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={inter.variable}>
			<body suppressHydrationWarning>
				<TRPCProvider>
					<div className="min-h-screen bg-background font-sans">
						<nav className="border-b bg-card">
							<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
								<div className="flex h-14 items-center justify-between">
									<div className="flex items-center gap-6">
										<a href="/" className="text-lg font-bold">
											LLMBench
										</a>
										<div className="flex gap-4 text-sm text-muted-foreground">
											<a href="/" className="hover:text-foreground transition-colors">
												Dashboard
											</a>
											<a href="/projects" className="hover:text-foreground transition-colors">
												Projects
											</a>
										</div>
									</div>
								</div>
							</div>
						</nav>
						<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
					</div>
				</TRPCProvider>
			</body>
		</html>
	);
}
