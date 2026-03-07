import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@llmbench/ui", "@llmbench/types", "@llmbench/db", "@llmbench/core"],
};

export default nextConfig;
