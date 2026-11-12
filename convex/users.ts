import { queryGeneric as query } from "convex/server";
import { v } from "convex/values";

export const getCurrent = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity === null) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_external_id", (index) =>
        index.eq("externalId", identity.subject),
      )
      .unique();
  },
});
