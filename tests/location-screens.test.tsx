// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { ResidentScreen, LguScreen } from "@/components/prototype/RoleScreens";
import { AccessPanel } from "@/components/auth/AccessPanel";
import { RiskSummary } from "@/components/dashboard/RiskSummary";
const m = vi.hoisted(() => ({
  account: {
    roleProfile: { city: "Pasig", requestedArea: "Manila" },
    assignedLocations: [] as string[],
  },
  params: new URLSearchParams(),
  save: vi.fn(),
  subscribe: vi.fn(),
  events: [] as unknown[],
}));
vi.mock("@/components/auth/WorkspaceGate", () => ({
  useWorkspaceAccount: () => m.account,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => m.params }));
vi.mock("@/lib/use-gis-layers", () => ({
  useGisLayers: () => ({ layers: [] }),
}));
vi.mock("@/components/map/RiverMap", () => ({
  RiverMap: ({ locationCode }: { locationCode: string }) => (
    <div aria-label="map">{locationCode}</div>
  ),
}));
vi.mock("@/lib/convex-config", () => ({
  convexConfigured: true,
  convexDeploymentUrl: "https://test.convex.cloud",
}));
vi.mock("@/lib/convex-query", () => ({
  useConvexQueryResult: (
    ref: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => {
    m.subscribe(getFunctionName(ref), args);
    return { data: null, error: null };
  },
}));
vi.mock("convex/react", async (inherit) => ({
  ...(await inherit<object>()),
  useMutation: () => m.save,
  useConvexAuth: () => ({ isAuthenticated: true }),
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "applications:audit" ? m.events : m.account,
}));
vi.mock("@/components/auth/FirebaseAuthProvider", () => ({
  useFirebaseAuth: () => ({
    user: { emailVerified: true },
    getIdToken: async () => "test",
  }),
}));
beforeEach(() => {
  m.account.roleProfile.city = "Pasig";
  m.account.assignedLocations = [];
  m.params = new URLSearchParams();
  m.save.mockReset();
  m.subscribe.mockClear();
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Test request" }), {
          status: 403,
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("uses the saved city for dashboard labels, stored outlook queries, forecast requests and the risk panel", async () => {
  const view = render(<ResidentScreen segments={[]} />);
  expect(screen.getAllByText("Pasig").length).toBeGreaterThan(0);
  expect(m.subscribe).toHaveBeenCalledWith("forecasts:latestOutlook", {
    locationCode: "pasig",
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Run forecast" })[0]);
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/forecast",
      expect.objectContaining({
        body: JSON.stringify({ locationCode: "pasig", horizonDays: 7 }),
      }),
    ),
  );
  m.account.roleProfile.city = "Quezon City";
  view.rerender(<ResidentScreen segments={[]} />);
  expect(screen.queryByText("Pasig")).toBeNull();
  expect(m.subscribe).toHaveBeenCalledWith("forecasts:latestOutlook", {
    locationCode: "quezon-city",
  });
  view.rerender(
    <RiskSummary
      locationCode="quezon-city"
      selectedDay={0}
      onDayChange={() => {}}
    />,
  );
  expect(screen.getByRole("heading", { name: "Quezon City" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Run forecast" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/forecast",
      expect.objectContaining({
        body: JSON.stringify({ locationCode: "quezon-city", horizonDays: 7 }),
      }),
    ),
  );
});
it("Set primary persists only the city, disables competing changes and leaves the old map in place on failure", async () => {
  const view = render(<ResidentScreen segments={["locations"]} />);
  const cityButton = () =>
    within(
      screen.getByRole("heading", { name: "Quezon City" }).closest("section")!,
    ).getByRole("button");
  let reject!: () => void;
  m.save.mockImplementationOnce(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  fireEvent.click(cityButton());
  expect(m.save).toHaveBeenCalledWith({ roleProfile: { city: "Quezon City" } });
  expect(
    screen
      .getAllByRole("button")
      .every((b) => (b as HTMLButtonElement).disabled),
  ).toBe(true);
  await act(async () => reject());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByLabelText("map").textContent).toBe("pasig");
  m.save.mockImplementationOnce(async () => {
    m.account.roleProfile.city = "Quezon City";
  });
  fireEvent.click(cityButton());
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
  view.rerender(<ResidentScreen segments={["locations"]} />);
  expect(cityButton().textContent).toBe("Selected");
  expect(screen.getByLabelText("map").textContent).toBe("quezon-city");
});
it("ignores stale device city and keeps only non-location preferences in localStorage", async () => {
  const key = "riverguard:resident-preferences";
  localStorage.setItem(
    key,
    JSON.stringify({ primaryCity: "Marikina", reducedMotion: true }),
  );
  render(<ResidentScreen segments={["preferences"]} />);
  const select = screen.getByLabelText("Primary city") as HTMLSelectElement;
  expect(select.value).toBe("Pasig");
  fireEvent.change(select, { target: { value: "Quezon City" } });
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(key)!)).not.toHaveProperty(
      "primaryCity",
    ),
  );
  expect(m.save).toHaveBeenCalledWith({ roleProfile: { city: "Quezon City" } });
  expect(JSON.parse(localStorage.getItem(key)!)).toHaveProperty(
    "reducedMotion",
    true,
  );
});
it("never subscribes for an unsupported area, but still offers supported replacements", () => {
  m.account.roleProfile.city = "Unsupported area";
  const view = render(<ResidentScreen segments={[]} />);
  expect(screen.getByText("Location outside coverage")).toBeTruthy();
  view.rerender(<ResidentScreen segments={["locations"]} />);
  expect(screen.getAllByRole("button", { name: "Set primary" })).toHaveLength(
    4,
  );
  expect(screen.queryByLabelText("map")).toBeNull();
  expect(m.subscribe).not.toHaveBeenCalled();
  m.account.roleProfile.city = " ";
  view.rerender(<ResidentScreen segments={[]} />);
  expect(screen.getByText("Default location · no saved city")).toBeTruthy();
  expect(m.subscribe).toHaveBeenCalledWith("forecasts:latestOutlook", {
    locationCode: "marikina",
  });
});
it.each(["marikina", "pasig"])(
  "only uses approved LGU assignment %s even with a conflicting requested city and URL",
  (code) => {
    m.account.assignedLocations = [code];
    m.params.set("city", "manila");
    render(<LguScreen segments={["outlook"]} />);
    expect(screen.getByLabelText("map").textContent).toBe(code);
    expect(m.subscribe).toHaveBeenCalledWith("forecasts:latestOutlook", {
      locationCode: code,
    });
  },
);
it("does not mount an outlook with no supported LGU assignment", () => {
  m.account.assignedLocations = ["outside"];
  render(<LguScreen segments={[]} />);
  expect(screen.getByText("No supported LGU assignment")).toBeTruthy();
  expect(m.subscribe).not.toHaveBeenCalled();
});
it("formats recorded audit fields in order, preserving IDs without inferring current status", () => {
  const id = "kn12345678901234567890";
  m.events = [
    {
      _id: "a",
      _creationTime: Date.UTC(2026, 10, 20, 13, 49),
      role: "lgu",
      action: "approved",
      actor: id,
      actorLabel: "Review officer",
      subject: "kn76543210987654321098",
      recipientLabel: null,
      location: "pasig",
    },
    {
      _id: "b",
      _creationTime: Date.UTC(2026, 10, 20, 13),
      role: "lgu",
      action: "registered pending",
      actor: id,
      subject: id,
    },
  ];
  render(<AccessPanel view="audit" />);
  const [first, second] = screen.getAllByRole("listitem");
  expect(within(first).getByText("Approved · LGU operator")).toBeTruthy();
  expect(within(first).getByText("Location: Pasig")).toBeTruthy();
  expect(first.querySelector("time")?.textContent).toMatch(/9:49.*PM/i);
  expect(
    within(first)
      .getByText("Review officer")
      .closest("details")
      ?.querySelector("code")?.textContent,
  ).toBe(id);
  expect(within(first).getByText("kn76543…21098")).toBeTruthy();
  expect(within(first).queryByText("Active")).toBeNull();
  expect(within(second).getByText("Pending")).toBeTruthy();
});
