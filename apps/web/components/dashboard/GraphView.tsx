'use client'

import { buildGraphLayout, type GraphLayout, type GraphNode as CoreGraphNode } from '@orchentra/cli-core/render'
import type { GraphNode } from '../../lib/types'
import { NodeCard, type NodeCardProps } from './NodeCard'

/**
 * Vertical CSS-grid tree of execution nodes. Pure render — takes nodes,
 * delegates layout to `buildGraphLayout`, draws via grid + indented rows.
 *
 * The web's `GraphNode` is a structural superset of cli-core's (it adds
 * argsJson/resultJson). It is assignable to `readonly CoreGraphNode[]` for
 * `buildGraphLayout`'s purposes.
 *
 * No `kind === 'ci_failure'`-style branches anywhere in this component or
 * <NodeCard>. Any execution kind renders through the same path.
 */
export interface GraphViewProps {
  nodes: GraphNode[]
  selectedNodeId?: string
  onSelectNode?: NodeCardProps['onSelect']
}

const INDENT_PX = 20

export function GraphView({ nodes, selectedNodeId, onSelectNode }: GraphViewProps) {
  if (nodes.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>
          No nodes yet for this execution.
        </p>
      </div>
    )
  }

  const layout = buildGraphLayout(nodes as readonly CoreGraphNode[])

  return (
    <div role="tree" className="px-5 py-4 grid gap-2">
      {layout.roots.map((root) => (
        <Subtree
          key={root.id}
          node={root}
          depth={0}
          layout={layout}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      ))}
    </div>
  )
}

interface SubtreeProps {
  node: CoreGraphNode
  depth: number
  layout: GraphLayout
  selectedNodeId?: string
  onSelectNode?: NodeCardProps['onSelect']
}

function Subtree({ node, depth, layout, selectedNodeId, onSelectNode }: SubtreeProps) {
  const children = layout.childrenByParent.get(node.id) ?? []
  const indent = depth * INDENT_PX

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selectedNodeId === node.id}
      aria-expanded={children.length > 0 ? true : undefined}
      className="grid gap-2"
      style={{ paddingLeft: indent ? `${indent}px` : undefined }}
    >
      <div
        style={
          depth > 0
            ? {
                borderLeft: '1px solid var(--color-app-border)',
                paddingLeft: '12px',
              }
            : undefined
        }
      >
        <NodeCard node={node as GraphNode} selected={selectedNodeId === node.id} onSelect={onSelectNode} />
      </div>
      {children.length > 0 && (
        <div role="group" className="grid gap-2">
          {children.map((child) => (
            <Subtree
              key={child.id}
              node={child}
              depth={depth + 1}
              layout={layout}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}
