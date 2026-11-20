import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
const profile = {
  organization: "University",
  researcherType: "faculty" as const,
  requestedArea: "Manila",
  purpose: "Flood research",
};
async function setup() {
  const db = convexTest(schema, modules);
  const identity = (subject: string, emailVerified = true) =>
    db.withIdentity({
      subject,
      email: subject + "@example.org",
      emailVerified,
    });
  await db.run((ctx) =>
    ctx.db.insert("users", {
      externalId: "admin",
      email: "admin@example.org",
      displayName: "Administrator",
      role: "admin",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { db, identity, admin: identity("admin"), member: identity("member") };
}
it("never provisions on lookup, and rejects admin signup", async () => {
  const { member } = await setup();
  expect(await member.query(api.users.getCurrent)).toBeNull();
  await expect(
    member.mutation(api.users.register, {
      requestedRole: "admin" as never,
      roleProfile: {},
    }),
  ).rejects.toThrow();
  expect(await member.query(api.users.getCurrent)).toBeNull();
});
it("Resident cannot enter the admin review queue; an upgrade preserves Resident access", async () => {
  const { member, admin } = await setup();
  await member.mutation(api.users.register, {
    requestedRole: "resident",
    roleProfile: { city: "Manila" },
  });
  await expect(member.query(api.applications.queue)).rejects.toThrow();
  await member.mutation(api.applications.request, {
    role: "researcher",
    profile,
  });
  await expect(
    member.mutation(api.applications.request, { role: "researcher", profile }),
  ).rejects.toThrow();
  const [row] = await admin.query(api.applications.queue);
  await expect(
    member.mutation(api.applications.decide, { id: row._id, approve: true }),
  ).rejects.toThrow();
  await expect(
    member.query(api.users.authorizeOperationalAccess),
  ).rejects.toThrow();
  await admin.mutation(api.applications.decide, { id: row._id, approve: true });
  expect(await member.query(api.users.getCurrent)).toMatchObject({
    role: "resident",
    status: "active",
    additionalRoles: ["researcher"],
  });
  expect(await member.query(api.users.authorizeOperationalAccess)).toBe(true);
  await expect(
    admin.mutation(api.applications.decide, { id: row._id, approve: false }),
  ).rejects.toThrow();
  expect(await admin.query(api.applications.audit)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ action: "approved", role: "researcher" }),
    ]),
  );
});
it("pending and rejected Researchers cannot use researcher operations or re-register as residents", async () => {
  const { member, admin } = await setup();
  await member.mutation(api.users.register, {
    requestedRole: "researcher",
    roleProfile: profile,
  });
  await expect(member.query(api.forecasts.recentRuns, {})).rejects.toThrow();
  const [row] = await admin.query(api.applications.queue);
  await admin.mutation(api.applications.decide, {
    id: row._id,
    approve: false,
  });
  expect(
    await member.mutation(api.users.register, {
      requestedRole: "resident",
      roleProfile: {},
    }),
  ).toMatchObject({ status: "rejected", role: "researcher" });
  await expect(member.query(api.forecasts.recentRuns, {})).rejects.toThrow();
});
it("LGU access is scoped to the city selected by the reviewer, not the requested area", async () => {
  const { member, admin } = await setup();
  await member.mutation(api.users.register, {
    requestedRole: "lgu",
    roleProfile: { ...profile, position: "Officer" },
  });
  const [row] = await admin.query(api.applications.queue);
  await expect(
    admin.mutation(api.applications.decide, { id: row._id, approve: true }),
  ).rejects.toThrow();
  await admin.mutation(api.applications.decide, {
    id: row._id,
    approve: true,
    location: "pasig",
  });
  expect(
    await member.query(api.users.authorizeOperationalAccess, {
      location: "pasig",
    }),
  ).toBe(true);
  expect(
    await member.query(api.users.authorizeOperationalAccess, {
      location: "manila",
    }),
  ).toBe(false);
});
it("invites are restricted to the verified recipient, expire, and are accepted once", async () => {
  const { db, admin, identity, member } = await setup();
  await member.mutation(api.users.register, {
    requestedRole: "resident",
    roleProfile: {},
  });
  const id = await admin.mutation(api.applications.invite, {
    email: "Member@example.org",
    role: "researcher",
  });
  await expect(
    admin.mutation(api.applications.accept, { id }),
  ).rejects.toThrow();
  await expect(
    identity("member", false).mutation(api.applications.accept, { id }),
  ).rejects.toThrow();
  expect(await member.query(api.applications.inbox)).toHaveLength(1);
  await member.mutation(api.applications.accept, { id });
  await expect(
    member.mutation(api.applications.accept, { id }),
  ).rejects.toThrow();
  const expired = await admin.mutation(api.applications.invite, {
    email: "member@example.org",
    role: "admin",
  });
  await db.run((ctx) => ctx.db.patch(expired, { expiresAt: 1 }));
  await expect(
    member.mutation(api.applications.accept, { id: expired }),
  ).rejects.toThrow();
});
it("legacy status is not implicit approval and legacy pending requests can be migrated twice", async () => {
  const { db, member, admin } = await setup();
  const user = await member.mutation(api.users.register, {
    requestedRole: "resident",
    roleProfile: {},
  });
  await db.run((ctx) =>
    ctx.db.patch(user._id, { role: "researcher", status: undefined }),
  );
  await expect(
    member.query(api.users.authorizeOperationalAccess),
  ).rejects.toThrow();
  await db.run((ctx) => ctx.db.patch(user._id, { status: "pending" }));
  await db.mutation(internal.applications.migratePending, {});
  await db.mutation(internal.applications.migratePending, {});
  expect(await admin.query(api.applications.queue)).toHaveLength(1);
});

it("persists primary city by identity across sessions without replacing profile fields, roles or LGU assignments", async () => {
  const { db, member, admin, identity } = await setup();
  const resident = await member.mutation(api.users.register, {
    requestedRole: "resident",
    roleProfile: { city: "Pasig", organization: "Sample association" },
  });
  expect((await member.query(api.users.getCurrent))?.roleProfile?.city).toBe(
    "Pasig",
  );
  const lgu = identity("lgu");
  const officer = await lgu.mutation(api.users.register, {
    requestedRole: "lgu",
    roleProfile: { ...profile, position: "Officer" },
  });
  const [req] = await admin.query(api.applications.queue);
  await admin.mutation(api.applications.decide, {
    id: req._id,
    approve: true,
    location: "marikina",
  });
  await member.mutation(api.users.updateCurrentProfile, {
    roleProfile: { city: "Quezon City" },
  });
  expect(await identity("member").query(api.users.getCurrent)).toMatchObject({
    _id: resident._id,
    displayName: resident.displayName,
    role: "resident",
    roleProfile: { city: "Quezon City", organization: "Sample association" },
    assignedLocations: null,
  });
  await expect(db.query(api.users.getCurrent)).rejects.toThrow();
  expect(await identity("other").query(api.users.getCurrent)).toBeNull();
  await expect(
    member.mutation(api.users.updateCurrentProfile, {
      userId: officer._id,
      assignedLocations: ["pasig"],
    } as never),
  ).rejects.toThrow();
  await lgu.mutation(api.users.updateCurrentProfile, {
    roleProfile: { requestedArea: "Quezon City" },
  });
  expect((await lgu.query(api.users.getCurrent))?.assignedLocations).toEqual([
    "marikina",
  ]);
  await db.run(async (ctx) => {
    const row = await ctx.db.query("lguProfiles").first();
    await ctx.db.delete(row!._id);
  });
  expect((await lgu.query(api.users.getCurrent))?.assignedLocations).toEqual(
    [],
  );
  const events = await admin.query(api.applications.audit);
  const approval = events.find((e) => e.action === "approved");
  expect(approval).toMatchObject({
    actorLabel: "Administrator",
    recipientLabel: officer.email,
    location: "marikina",
    subject: officer._id,
  });
  await expect(member.query(api.applications.audit)).rejects.toThrow();
});
