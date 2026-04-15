'use client'

import type { IncidentFull, ToolCall } from '../../lib/hooks'
import { type StatusKey, STATUS_CONFIG, fmtDuration } from './incidents.utils'
import { Section, MetaCard } from './IncidentDetailPrimitives'

interface IncidentDetailBodyProps {
  inc: IncidentFull
  cfg: (typeof STATUS_CONFIG)[StatusKey]
  toolCalls: ToolCall[]
}

export function IncidentDetailBody({ inc, toolCalls }: IncidentDetailBodyProps) {
  return (
    <>
      {inc.rootCause && (
        <Section title="Root Cause">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-app-text-secondary)' }}>
            {inc.rootCause}
          </p>
        </Section>
      )}

      {inc.suggestedFix && (
        <Section title="Suggested Fix">
          <div
            className="rounded-xl p-3 text-xs leading-relaxed border"
            style={{
              background: 'var(--color-app-deep)',
              borderColor: 'var(--color-app-border)',
              color: 'var(--color-app-text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {inc.suggestedFix}
          </div>
        </Section>
      )}

      <Section title="Details">
        <div className="grid grid-cols-2 gap-1.5">
          <MetaCard label="Branch" value={inc.branch} mono />
          <MetaCard label="Commit" value={inc.commit.slice(0, 12)} mono />
          {inc.confidence !== null && <MetaCard label="Confidence" value={`${Math.round(inc.confidence * 100)}%`} />}
          {inc.mttrSeconds != null && <MetaCard label="MTTR" value={fmtDuration(inc.mttrSeconds)} />}
          {inc.tokenInputs != null && (
            <MetaCard
              label="Tokens"
              value={`${((inc.tokenInputs + (inc.tokenOutputs ?? 0)) / 1000).toFixed(1)}k`}
              mono
            />
          )}
          {inc.estimatedCostUsd != null && (
            <MetaCard
              label="Est. Cost"
              value={inc.estimatedCostUsd < 0.01 ? `<$0.01` : `$${inc.estimatedCostUsd.toFixed(3)}`}
            />
          )}
        </div>
      </Section>

      {toolCalls.length > 0 && (
        <Section title={`Agent Activity · ${toolCalls.length} calls`}>
          <div className="space-y-1">
            {toolCalls.map((tc) => (
              <div
                key={tc.id}
                className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-2 border"
                style={{
                  background: 'var(--color-app-deep)',
                  borderColor: 'var(--color-app-border)',
                }}
              >
                <div className="w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-brand)' }} />
                <span className="font-medium" style={{ color: 'var(--color-app-text-secondary)' }}>
                  {tc.integration}
                </span>
                <span style={{ color: 'var(--color-app-text-subtle)' }}>round {tc.round}</span>
                {tc.durationMs !== null && (
                  <span className="ml-auto" style={{ color: 'var(--color-app-text-subtle)' }}>
                    {tc.durationMs}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}
