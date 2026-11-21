/**
 * LGU jurisdiction provisioning.
 *
 * Why this exists: `lguProfiles` had no writers anywhere in the codebase, so
 * every LGU account resolved to an empty jurisdiction list and `recordOutlook`
 * rejected it for every location. LGU signups are also created with
 * `status: "pending"` and had no approval path — the account could never
 * become active.
 *
 * This module is the secure path: an administrator (never the LGU user
 * themselves) assigns the jurisdiction. Until an administrator does, the LGU
 * account stays `pending` (cannot sign in past the gate) or `active` with no
 * jurisdiction (fail-closed with an explanatory error, see `assertLocationAccess`).
 *
 * Nothing here grants unrestricted access: `assignedLocationCodes` must list
 * between 1 and 4 supported codes, validated server-side.
 */

import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";

import { requireCurrentUser, requireRole } from "./auth";
import { assertSupportedCityCode, SUPPORTED_CITY_CODES } from "./cityCodes";
import { normalizeLocationCode } from "./lgu";

/**
 * List LGU accounts awaiting jurisdiction assignment.
 *
 * Admin-only. Returns the signup request metadata (organization, requested
 * area, purpose) so the administrator can verify the request out of band
 * before provisioning — nothing in this project can prove employment at an
 * LGU, so approval is a human decision, by construction.
 */
export const listPendingLguUsers = query({
  args: {},
  returns: v.array(
    v.object({
      userId: v.string(),
      email: v.string(),
      displayName: v.string(),
      status: v.string(),
      organization: v.optional(v.string()),
      position: v.optional(v.string()),
      requestedArea: v.optional(v.string()),
      purpose: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireRole(ctx, ["admin"]);
    const users = await ctx.db.query("users").collect();
    return users
      .filter((user: any) => user.role === "lgu" && user.status !== "active")
      .map((user: any) => ({
        userId: String(user._id),
        email: user.email,
        displayName: user.displayName,
        status: user.status ?? "pending",
        organization: user.roleProfile?.organization,
        position: user.roleProfile?.position,
        requestedArea: user.roleProfile?.requestedArea,
        purpose: user.roleProfile?.purpose,
        createdAt: user.createdAt,
      }))
      .sort((a: any, b: any) => a.createdAt - b.createdAt);
  },
});

/**
 * Provision (or update) the LGU profile for one account and activate it.
 *
 * Admin-only. The jurisdiction is validated against the four supported city
 * codes; duplicates are removed; `cityCode` is the primary jurisdiction and is
 * always part of `assignedLocationCodes`. Requires at least one code — an
 * empty assignment is not a meaningful provisioning and is rejected rather
 * than stored as a silent lockout.
 *
 * Re-provisioning is idempotent: it updates the existing row in place, so the
 * same action can widen or narrow a jurisdiction later without losing the
 * audit trail of requestedBy/assigned by (recorded via updatedAt).
 */
export const provisionLguProfile = mutation({
  args: {
    email: v.string(),
    cityCode: v.string(),
    assignedLocationCodes: v.optional(v.array(v.string())),
    organization: v.optional(v.string()),
    position: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.string(),
    assignedLocationCodes: v.array(v.string()),
    status: v.string(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, ["admin"]);

    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("email is required.");

    const cityCode = assertSupportedCityCode(args.cityCode);
    const assigned = [
      ...new Set(
        (args.assignedLocationCodes ?? [cityCode]).map((code) =>
          assertSupportedCityCode(code),
        ),
      ),
    ];
    if (!assigned.includes(cityCode)) {
      assigned.unshift(cityCode);
    }
    if (assigned.length === 0) {
      throw new Error("assignedLocationCodes must not be empty.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (index: any) => index.eq("email", email))
      .unique();
    if (!user) {
      throw new Error(
        `No RiverGuard account found for ${email}. The user must sign up first (their account is created as an LGU request).`,
      );
    }
    if (user.role !== "lgu") {
      throw new Error(
        `${email} is registered as "${user.role}", not "lgu". Only LGU accounts can be provisioned an LGU profile.`,
      );
    }

    const now = Date.now();
    const organization =
      args.organization?.trim() ||
      user.roleProfile?.organization ||
      "LGU (unspecified organization)";
    const position = args.position?.trim() || user.roleProfile?.position;

    const existing = await ctx.db
      .query("lguProfiles")
      .withIndex("by_user", (index: any) => index.eq("userId", user._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        cityCode,
        assignedLocationCodes: assigned,
        organization,
        ...(position ? { position } : {}),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("lguProfiles", {
        userId: user._id,
        cityCode,
        assignedLocationCodes: assigned,
        organization,
        ...(position ? { position } : {}),
        createdAt: now,
        updatedAt: now,
      });
    }

    // An approved LGU can now sign in; pending accounts cannot pass the gate.
    if (user.status !== "active") {
      await ctx.db.patch(user._id, { status: "active", updatedAt: now });
    }

    console.info(
      `[lguProfiles] admin ${admin._id} provisioned ${email} → [${assigned.join(", ")}]`,
    );

    return {
      userId: String(user._id),
      assignedLocationCodes: assigned,
      status: "active",
    };
  },
});

/**
 * The caller's own LGU profile, or null.
 *
 * Lets the app render "awaiting jurisdiction assignment" instead of a generic
 * permission error — an LGU who sees the exact state of their account can
 * act on it (contact their administrator) instead of filing a bug.
 */
export const myLguProfile = query({
  args: {},
  returns: v.union(
    v.object({
      cityCode: v.string(),
      assignedLocationCodes: v.array(v.string()),
      organization: v.string(),
      position: v.optional(v.string()),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    if (user.role !== "lgu") return null;
    const profile = await ctx.db
      .query("lguProfiles")
      .withIndex("by_user", (index: any) => index.eq("userId", user._id))
      .first();
    if (!profile) return null;
    return {
      cityCode: profile.cityCode,
      assignedLocationCodes: [
        ...new Set(
          [...(profile.assignedLocationCodes ?? []), profile.cityCode].map(
            (code) => normalizeLocationCode(code),
          ),
        ),
      ],
      organization: profile.organization,
      position: profile.position,
      updatedAt: profile.updatedAt,
    };
  },
});

/** Reference for operators: the codes the provisioning mutations accept. */
export const supportedCityCodes = query({
  args: {},
  returns: v.array(v.string()),
  handler: async () => [...SUPPORTED_CITY_CODES],
});
