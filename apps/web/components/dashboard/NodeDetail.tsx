'use client'

import { Loader2, AlertTriangle, X } from 'lucide-react'
import { useNodeLineage } from '../../lib/hooks'
import type { GraphNode } from '../../lib/types'

/**
 * Side panel that fetches a node's lineage via /api/orgs/:orgId/nodes/:id/lineage
 * and renders the ancestor chain plus pretty-printed inputs (argsJson) and
 * outcome (resultJson). Sections are omitted when their JSON is missing.
 *
 * Ancestor chain renders root → parent → selected, mirroring the CLI's
 * `formatNodeLineage` shape but with JSX rows instead of an ASCII tree.
 */
export interface NodeDetailProps {
  nodeId: string
  onClose?: () => void
}

export function NodeDetail({ nodeId, onClose }: NodeDetailProps) {
  const { data, isLoading, error } = useNodeLineage(nodeId)

  return (
    <aside
      aria-label="Node detail"
      className="w-80 shrink-0 overflow-y-auto"
      style={{ background: 'var(--color-app-deep)' }}
    >
      <div
        className="px-4 py-3 border-b flex items-center justify-between sticky top-0"
        style={{ borderColor: 'var(--color-app-border)', background: 'var(--color-app-deep)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--color-app-text)' }}>
          Node detail
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close node detail"
            className="p-1 rounded hover:opacity-70"
            style={{ color: 'var(--color-app-text-subtle)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <DetailLoading />
      ) : error ? (
        <DetailError error={error} />
      ) : !data ? (
        <DetailError error={new Error('Node not found')} />
      ) : (
        <DetailBody node={data.node} ancestors={data.ancestors} />
      )}
    </aside>
  )
}

function DetailBody({ node, ancestors }: { node: GraphNode; ancestors: GraphNode[] }) {
  return (
    <div className="px-4 py-4 grid gap-4">
      <Section label="Lineage">
        <ol className="grid gap-1">
          {ancestors.map((ancestor, i) => (
            <LineageRow key={ancestor.id} node={ancestor} depth={i} active={false} />
          ))}
          <LineageRow node={node} depth={ancestors.length} active />
        </ol>
      </Section>

      {node.argsJson && (
        <Section label="Inputs">
          <JsonBlock raw={node.argsJson} />
        </Section>
      )}

      {node.resultJson && (
        <Section label="Outcome">
          <JsonBlock raw={node.resultJson} />
        </Section>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-[10px] font-medium uppercase tracking-wide mb-1.5"
        style={{ color: 'var(--color-app-text-subtle)' }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function LineageRow({ node, depth, active }: { node: GraphNode; depth: number; active: boolean }) {
  return (
    <li
      className="text-[11px] flex items-center gap-2 rounded px-2 py-1"
      style={{
        paddingLeft: `${8 + depth * 12}px`,
        background: active ? 'var(--color-app-panel)' : undefined,
        border: active ? '1px solid var(--color-brand)' : '1px solid transparent',
      }}
    >
      <span className="font-mono shrink-0" style={{ color: 'var(--color-app-text-subtle)' }}>
        {depth === 0 ? '' : '└─'}
      </span>
      <span className="font-medium truncate" style={{ color: 'var(--color-app-text)' }}>
        {node.integration}
      </span>
      <span style={{ color: 'var(--color-app-text-muted)' }}>·</span>
      <span className="truncate" style={{ color: 'var(--color-app-text-muted)' }}>
        {node.kind}
      </span>
      <span className="ml-auto font-mono tabular-nums shrink-0" style={{ color: 'var(--color-app-text-subtle)' }}>
        #{node.round}
      </span>
    </li>
  )
}

function JsonBlock({ raw }: { raw: string }) {
  return (
    <pre
      className="text-[11px] font-mono leading-relaxed rounded p-2 overflow-x-auto whitespace-pre-wrap break-words"
      style={{
        background: 'var(--color-app-panel)',
        color: 'var(--color-app-text)',
        border: '1px solid var(--color-app-border)',
      }}
    >
      {prettyJson(raw)}
    </pre>
  )
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function DetailLoading() {
  return (
    <div className="px-4 py-10 flex items-center justify-center">
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-app-text-subtle)' }} />
    </div>
  )
}

function DetailError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Failed to load node'
  return (
    <div className="px-4 py-10 text-center">
      <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-2" />
      <p className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>
        {message}
      </p>
    </div>
  )
}
