import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Panel,
  SectionHeading,
  SelectField,
  StatusLabel,
  Toggle,
  Tooltip,
  UnavailableState,
} from "@/components/ui";

const colors = [
  { name: "Stage", className: "bg-stage", value: "#1C1C1A" },
  { name: "Canvas", className: "bg-canvas", value: "#E8E5DE" },
  { name: "Smoke", className: "bg-smoke", value: "#5C5D59" },
  { name: "Analysis", className: "bg-analysis", value: "#11110F" },
  { name: "Coral", className: "bg-coral-500", value: "#F26B5E" },
];

export const metadata = {
  title: "Design foundation",
};

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-stage px-6 py-8 text-ink lg:px-10 lg:py-10">
      <div className="mx-auto max-w-[1440px] rounded-structure bg-canvas p-6 md:p-8 lg:p-10">
        <header className="flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-metadata uppercase tracking-[0.14em] text-muted">
              RiverGuard / Foundations
            </p>
            <h1 className="text-page-title mt-2">Design system preview</h1>
            <p className="text-body mt-2 max-w-2xl text-muted">
              A focused review surface for typography, color, controls, panels,
              and honest system states before dashboard composition begins.
            </p>
          </div>
          <StatusLabel tone="experimental">Development preview</StatusLabel>
        </header>

        <div className="grid gap-10 py-10">
          <section aria-labelledby="color-heading">
            <SectionHeading
              id="color-heading"
              eyebrow="01"
              title="Color and surfaces"
              description="Coral is reserved for selection and essential emphasis. Neutral surfaces carry the interface."
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {colors.map((color) => (
                <div key={color.name} className="overflow-hidden rounded-panel">
                  <div className={`h-24 ${color.className}`} />
                  <div className="bg-canvas-soft p-3">
                    <p className="text-button">{color.name}</p>
                    <p className="text-metadata mt-0.5 text-muted">
                      {color.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Divider />

          <section aria-labelledby="typography-heading">
            <SectionHeading
              id="typography-heading"
              eyebrow="02"
              title="Typography"
              description="Geist uses a compact hierarchy with weight and tone doing more work than oversized type."
            />
            <Panel className="mt-5 grid gap-6" tone="canvas">
              <div>
                <p className="text-metadata text-muted">Page title · 28/34</p>
                <p className="text-page-title mt-1">Researcher Dashboard</p>
              </div>
              <div>
                <p className="text-metadata text-muted">Major status · 22/27</p>
                <p className="text-major-status mt-1">
                  Elevated experimental index
                </p>
              </div>
              <div>
                <p className="text-metadata text-muted">
                  Section · body · metadata
                </p>
                <p className="text-section mt-1">Historical context</p>
                <p className="text-body mt-1 max-w-xl text-muted">
                  Illustrative city-level sample data for interface development.
                  This is not an official warning or operational reading.
                </p>
              </div>
            </Panel>
          </section>

          <Divider />

          <section aria-labelledby="controls-heading">
            <SectionHeading
              id="controls-heading"
              eyebrow="03"
              title="Controls and status"
              description="Every control includes visible focus, disabled behavior, and an accessible name."
            />
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <Panel>
                <h3 className="text-section">Buttons</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button>Run forecast</Button>
                  <Button variant="secondary">Open evidence</Button>
                  <Button variant="quiet">Refresh</Button>
                  <Button loading loadingLabel="Running forecast">
                    Run forecast
                  </Button>
                  <Button disabled>Unavailable</Button>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <Tooltip content="Refresh available evidence">
                    <IconButton label="Refresh available evidence">
                      ↻
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="Open dashboard settings">
                    <IconButton label="Open dashboard settings">⋯</IconButton>
                  </Tooltip>
                </div>
              </Panel>

              <Panel>
                <h3 className="text-section">Status labels</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusLabel tone="experimental">Experimental</StatusLabel>
                  <StatusLabel tone="available">Available sample</StatusLabel>
                  <StatusLabel tone="warning">Stale forecast</StatusLabel>
                  <StatusLabel tone="unavailable">Unavailable</StatusLabel>
                  <StatusLabel tone="unsupported">Unsupported</StatusLabel>
                </div>
              </Panel>

              <Panel>
                <SelectField
                  id="supported-city"
                  label="Supported city"
                  hint="Initial development coverage only."
                  defaultValue="marikina"
                >
                  <option value="quezon-city">Quezon City</option>
                  <option value="marikina">Marikina</option>
                  <option value="manila">Manila</option>
                  <option value="pasig">Pasig</option>
                </SelectField>
              </Panel>

              <Panel className="grid gap-5">
                <Toggle
                  label="Experimental outlook"
                  description="Illustrative dynamic research layer"
                  defaultPressed
                />
                <Divider />
                <Toggle
                  label="Static hazard susceptibility"
                  description="Context layer kept separate from predictions"
                />
                <Divider />
                <Toggle
                  label="Unavailable layer"
                  description="Disabled when no verified asset exists"
                  disabled
                />
              </Panel>
            </div>
          </section>

          <Divider />

          <section aria-labelledby="panels-heading">
            <SectionHeading
              id="panels-heading"
              eyebrow="04"
              title="Structural panels"
              description="Surface hierarchy separates navigation, status, and analysis without a generic card grid."
            />
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <Panel tone="canvas">
                <p className="text-metadata text-muted">Canvas panel</p>
                <h3 className="text-section mt-2">Spatial workspace</h3>
              </Panel>
              <Panel tone="smoke">
                <p className="text-metadata text-white/65">Status panel</p>
                <h3 className="text-section mt-2">Selected city context</h3>
              </Panel>
              <Panel tone="analysis">
                <p className="text-metadata text-white/55">Analysis panel</p>
                <h3 className="text-section mt-2">Historical evidence</h3>
              </Panel>
            </div>
          </section>

          <Divider />

          <section aria-labelledby="states-heading">
            <SectionHeading
              id="states-heading"
              eyebrow="05"
              title="Truth and failure states"
              description="Unavailable or unsupported information is explicit; missing evidence never defaults to low risk."
            />
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <LoadingState />
              <EmptyState action={<Button size="small">Choose city</Button>} />
              <UnavailableState
                action={
                  <Button size="small" variant="quiet">
                    View limitations
                  </Button>
                }
              />
              <ErrorState
                action={
                  <Button size="small" variant="secondary">
                    Retry
                  </Button>
                }
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
