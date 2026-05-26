import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase/server'
import { assertRepoAccess } from '../../../../lib/github/run-access'
import { getRunDetail } from '../../../../lib/github/run-detail'
import { RunDetailView } from '../../../../components/pd/runs/RunDetailView'

export const dynamic = 'force-dynamic'

// Route: /runs/<installationId>/<owner>/<repo>/<runId>
export default async function RunDetailPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  if (slug.length !== 4) notFound()

  const [installationIdRaw, owner, repo, runIdRaw] = slug
  const installationId = Number(installationIdRaw)
  const runId = Number(runIdRaw)
  if (!Number.isInteger(installationId) || !Number.isInteger(runId)) notFound()
  const repoFullName = `${owner}/${repo}`

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Access boundary: never mint a token for a repo the user does not subscribe to.
  const allowed = await assertRepoAccess(user.id, installationId, repoFullName)
  if (!allowed) notFound()

  const detail = await getRunDetail(installationId, repoFullName, runId)
  if (!detail) notFound()

  return <RunDetailView detail={detail} installationId={installationId} />
}
