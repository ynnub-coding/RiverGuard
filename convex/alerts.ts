import { paginationOptsValidator, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

export const listForLocation = query({
  args: {
    locationCode: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("alerts")
      .withIndex("by_location_created_at", (index) =>
        index.eq("locationCode", args.locationCode),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
