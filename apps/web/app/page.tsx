import { redirect } from 'next/navigation'
import { MarketingLanding } from '../components/marketing-v2'
import { createClient } from '../lib/supabase/server'
import pkg from '../package.json'

export default async function Page(): Promise<React.ReactNode> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return <MarketingLanding loginHref="/login" version={pkg.version} />
}
