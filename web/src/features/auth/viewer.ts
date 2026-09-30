import "server-only";

/**
 * What a route needs to know about who is asking. Routes may not import `data/`, so they reach the
 * session through here: `requireViewer()` at the top of every private page, `getViewer()` for the
 * pages that render differently when signed out (sign-in, password reset).
 */
export { requireViewer } from "@/data/guards";
export { getViewer } from "@/data/viewer.repository";
