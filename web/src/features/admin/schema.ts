import { z } from "zod";

/** The id of the person an admin action is about. Server Action arguments are untrusted input. */
export const personIdInput = z.uuid("Something went wrong. Reload and try again.");
