import Link from 'next/link'
import { ProfileMenu } from './ProfileMenu'

interface Props {
  email: string | null | undefined
  fullName: string | null | undefined
  avatarUrl: string | null | undefined
}

export function Topbar({ email, fullName, avatarUrl }: Props) {
  return (
    <header className="flex min-h-[3.5rem] items-center justify-between bg-darkest px-5">
      <Link href="/" className="flex items-center gap-3">
        <span className="h-5 w-5 rounded-[4px] bg-primary" />
        <span className="text-[17px] font-semibold tracking-[0.5rem] text-[#C3C3C3]">ORCHENTRA</span>
      </Link>
      <ProfileMenu email={email} fullName={fullName} avatarUrl={avatarUrl} />
    </header>
  )
}
