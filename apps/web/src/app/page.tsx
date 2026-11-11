import Link from "next/link";

export default function Home() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100"
    >
      <section className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-black/20">
        <p className="text-sm font-medium text-coral-300">
          Frontend foundation
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          RiverGuard is ready for interface development.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
          The Next.js, TypeScript, Tailwind CSS, linting, formatting, and build
          toolchain are configured. The approved Spatial Ledger design will be
          introduced in the next development stage.
        </p>
        <Link
          href="/design-system"
          className="text-button mt-6 inline-flex min-h-10 items-center rounded-control bg-coral-500 px-4 text-analysis transition-colors hover:bg-coral-300"
        >
          Review design foundation
        </Link>
      </section>
    </main>
  );
}
