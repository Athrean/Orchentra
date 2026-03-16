export default function LandingPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="text-4xl font-medium tracking-tight text-zinc-900 mb-4">
        Your CI fails. Orchentra investigates.
      </h1>
      <p className="text-xl text-zinc-500">
        AI agent that reads your GitHub Actions logs, queries Sentry,
        and posts a root cause brief in Slack — in 30 seconds.
      </p>
    </main>
  )
}
