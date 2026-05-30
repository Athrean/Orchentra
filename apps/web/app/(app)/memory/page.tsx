import { redirect } from 'next/navigation'
import { BookOpenText, Brain, GitBranch, Repeat, Sparkles } from 'lucide-react'
import { createClient } from '../../../lib/supabase/server'
import { getBrainForUser } from '../../../lib/graph/brain'
import { getRepeatedFailuresForUser, type RepeatedFailure } from '../../../lib/graph/detections'
import { listMemories } from '../../../lib/db/queries/memories'
import type { UserMemory } from '../../../lib/db/schema'

export const metadata = { title: 'Memory · Orchentra' }
export const dynamic = 'force-dynamic'

export default async function MemoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [brain, memories, repeated] = await Promise.all([
    getBrainForUser(user.id),
    listMemories(user.id),
    getRepeatedFailuresForUser(user.id),
  ])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-12 pt-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-pg-text-0">Memory</h1>
        <p className="mt-1 text-sm text-pg-text-mute">
          Saved learnings, recurring failures, and episodes — so context does not have to be re-explained.
        </p>
      </header>

      <SavedMemories memories={memories} />
      <RepeatedFailures items={repeated.items} />

      <h2 className="text-xs font-medium uppercase tracking-wider text-pg-text-mute">Distilled from the graph</h2>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="surface overflow-hidden">
          <div className="border-b border-pg-hairline px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-pg-text-0">
              <Brain className="h-4 w-4 text-pg-text-mute" />
              Episodes
            </div>
          </div>
          {brain.episodes.length === 0 ? (
            <div className="py-16 text-center text-sm text-pg-text-mute">
              No episodes recorded for subscribed repos.
            </div>
          ) : (
            <ul className="divide-y divide-pg-hairline">
              {brain.episodes.map((episode) => (
                <li key={episode.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-pg-text-mute">
                    <GitBranch className="h-3.5 w-3.5" />
                    {episode.repo}
                    <span>·</span>
                    <span>{episode.outcome}</span>
                    <span>·</span>
                    <span>{episode.createdAt.toLocaleString()}</span>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-pg-text-0">{episode.summary}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {episode.opsCalled.map((op) => (
                      <span key={op} className="rounded-[6px] bg-pg-surface-1 px-2 py-1 text-xs text-pg-text-mute">
                        {op}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-pg-text-0">
            <BookOpenText className="h-4 w-4 text-pg-text-mute" />
            Runbooks
          </div>
          {brain.runbooks.length === 0 ? (
            <div className="surface py-16 text-center text-sm text-pg-text-mute">No runbooks distilled yet.</div>
          ) : (
            brain.runbooks.map((runbook) => (
              <article key={runbook.id} className="surface p-4">
                <h2 className="text-sm font-medium text-pg-text-0">{runbook.name}</h2>
                <p className="mt-1 text-sm leading-6 text-pg-text-mute">{runbook.description || 'No description.'}</p>
                <TokenGroup label="Triggers" values={runbook.triggers} />
                <TokenGroup label="Ops used" values={runbook.opsUsed} />
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  )
}

function SavedMemories({ memories }: { memories: UserMemory[] }) {
  return (
    <section className="surface overflow-hidden">
      <div className="flex items-center gap-2 border-b border-pg-hairline px-5 py-4 text-sm font-medium text-pg-text-0">
        <Sparkles className="h-4 w-4 text-pg-accent-green" />
        Saved memories
        <span className="ml-auto text-xs font-normal text-pg-text-mute">
          The assistant saves learnings here from chat.
        </span>
      </div>
      {memories.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-pg-text-mute">
          No saved memories yet. Ask the assistant to remember a fix or preference in Investigate or Triage.
        </div>
      ) : (
        <ul className="divide-y divide-pg-hairline">
          {memories.map((memory) => (
            <li key={memory.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-pg-text-0">
                {memory.title}
                {memory.repo && (
                  <span className="inset-chip px-2 py-0.5 text-[11px] font-normal text-pg-text-mute">
                    {memory.repo}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-6 text-pg-text-mute">{memory.content}</p>
              {memory.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {memory.tags.map((tag) => (
                    <span key={tag} className="rounded-[6px] bg-pg-surface-1 px-2 py-1 text-xs text-pg-text-mute">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RepeatedFailures({ items }: { items: RepeatedFailure[] }) {
  if (items.length === 0) return null
  return (
    <section className="surface overflow-hidden">
      <div className="flex items-center gap-2 border-b border-pg-hairline px-5 py-4 text-sm font-medium text-pg-text-0">
        <Repeat className="h-4 w-4 text-amber-600" />
        Recurring failures
        <span className="ml-auto text-xs font-normal text-pg-text-mute">Last 90 days</span>
      </div>
      <ul className="divide-y divide-pg-hairline">
        {items.map((item) => (
          <li
            key={`${item.repo}-${item.workflow}-${item.failedStep ?? ''}`}
            className="flex items-center gap-3 px-5 py-3 text-sm"
          >
            <span className="flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-amber-500/10 px-1.5 text-xs font-medium text-amber-700">
              {item.count}×
            </span>
            <span className="text-pg-text-0">{item.repo}</span>
            <span className="text-pg-text-mute">{item.workflow}</span>
            {item.failedStep && <span className="font-mono text-xs text-pg-text-mute">{item.failedStep}</span>}
            <span className="ml-auto text-xs text-pg-text-mute">{item.lastOccurredAt.toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TokenGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-3">
      <div className="text-xs font-medium uppercase tracking-wider text-pg-text-mute">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {values.length === 0 ? (
          <span className="text-xs text-pg-text-mute">None</span>
        ) : (
          values.map((value) => (
            <span key={value} className="rounded-[6px] bg-pg-surface-1 px-2 py-1 text-xs text-pg-text-mute">
              {value}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
