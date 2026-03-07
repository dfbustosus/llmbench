import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/trpc/routers";
import { getDB } from "@/trpc/server";

const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: () => ({ db: getDB() }),
	});

export { handler as GET, handler as POST };
