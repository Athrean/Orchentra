import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Workspace · Orchentra' }

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  redirect(q ? `/triage?q=${encodeURIComponent(q)}` : '/triage')
}
