import { CrossExecutionDiff } from '../../../components/dashboard/CrossExecutionDiff'

export default async function Page({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams
  if (!a || !b) {
    return (
      <div className="p-6 text-red-400">
        Provide both `a` and `b` execution ids: /dashboard/diff?a=&lt;id&gt;&b=&lt;id&gt;.
      </div>
    )
  }

  let executionIdA: string
  let executionIdB: string
  try {
    executionIdA = decodeURIComponent(a)
    executionIdB = decodeURIComponent(b)
  } catch {
    return <div className="p-6 text-red-400">Invalid execution identifier in `a` or `b`.</div>
  }

  if (executionIdA === executionIdB) {
    return <div className="p-6 text-red-400">`a` and `b` must reference different executions.</div>
  }

  return <CrossExecutionDiff executionIdA={executionIdA} executionIdB={executionIdB} />
}
