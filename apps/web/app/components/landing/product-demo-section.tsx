import { PlayIcon } from '../animate-icons'
import { SectionHeading } from '../landing-ui'

function SlackMockup(): React.ReactNode {
  return (
    <div className="flex items-center justify-center p-8 md:p-12">
      <div className="shadow-elevated w-full max-w-lg overflow-hidden rounded-[28px] border border-border bg-surface-1">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
          <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
          <span className="h-2 w-2 rounded-full bg-[#28c840]" />
          <span className="ml-2 font-mono text-[10px] text-text-muted"># incidents</span>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[16px] bg-accent/10 font-serif text-xs font-bold text-accent">
              O
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-semibold text-text-primary">Orchentra</span>
                <span className="font-mono text-[9px] text-text-muted">2:34 PM</span>
              </div>
              <div className="mt-1.5 rounded-[22px] border border-border bg-surface-0 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                  CI &middot; deploy-api &middot; my-org/api
                </p>
                <p className="mt-2 text-[11px] leading-snug text-text-secondary">
                  Missing{' '}
                  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px] text-accent">
                    DATABASE_URL
                  </code>{' '}
                  env var. Confidence: <span className="font-mono text-accent">92%</span>
                </p>
                <div className="mt-2 flex gap-1.5">
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                    Re-run with fix
                  </span>
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-muted">
                    Dig deeper
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProductDemoSection(): React.ReactNode {
  return (
    <section id="demo" className="bg-surface-0 py-24 md:py-32">
      <div className="mx-auto max-w-[1440px] px-6">
        <SectionHeading
          icon={<PlayIcon size={28} />}
          title={
            <>
              See Orchentra
              <br className="hidden sm:block" />
              in action
            </>
          }
        />

        <p className="mx-auto mt-4 max-w-md text-center text-[15px] text-text-secondary">
          From CI failure to root cause brief — in 30 seconds.
        </p>

        <div className="shadow-elevated mx-auto mt-12 max-w-4xl overflow-hidden rounded-[32px] border border-border bg-surface-1">
          <div className="flex items-center gap-1.5 border-b border-border px-5 py-3.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 font-mono text-[11px] text-text-muted">orchentra — dashboard</span>
          </div>
          <div className="relative bg-surface-2">
            <SlackMockup />
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-2xl">
          <div className="shadow-elevated overflow-hidden rounded-[32px] border border-border bg-[#1a1a1a]">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-mono text-[11px] text-white/40">terminal</span>
            </div>
            <pre className="overflow-x-auto px-6 py-5 font-mono text-[13px] leading-8 text-white/70">
              <span className="text-white/40">$</span> <span className="text-white">git clone</span>{' '}
              <span className="text-green-400">https://github.com/Athrean/Orchentra</span>
              {'\n'}
              <span className="text-white/40">$</span> <span className="text-white">cd</span> Orchentra {'&&'}{' '}
              <span className="text-white">cp</span> orchentra.yml.example orchentra.yml
              {'\n'}
              <span className="text-white/40">$</span> <span className="text-white">docker compose up</span>
              <span className="blink text-green-400 ml-1">▋</span>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
