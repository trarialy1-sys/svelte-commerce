import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { clerkPublishableKey } from "@/lib/clerk-env";

// Next.js 16 renamed Middleware → Proxy (same behaviour, file is `proxy.ts`).
// This is a convenience gate only — authoritative checks are re-run server-side
// in each guarded route via the helpers in `@/lib/auth`.

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)", // Clerk webhook — verified by svix signature, not auth
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  },
  // Only the publishable key is sanitized/passed here. Passing `secretKey`
  // would activate Clerk "dynamic keys" mode, which requires CLERK_ENCRYPTION_KEY;
  // instead Clerk reads CLERK_SECRET_KEY from the environment at runtime.
  { publishableKey: clerkPublishableKey }
);

export const config = {
  matcher: [
    // Skip Next internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
