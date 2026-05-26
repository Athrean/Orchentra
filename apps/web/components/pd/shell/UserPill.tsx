import Image from 'next/image'

interface Props {
  email: string | null | undefined
  fullName: string | null | undefined
  avatarUrl: string | null | undefined
}

export function UserPill({ email, fullName, avatarUrl }: Props) {
  const display = fullName ?? email ?? 'Signed in'
  const initial = ((email ?? fullName ?? '?')[0] ?? '?').toUpperCase()

  return (
    <div className="flex items-center gap-2.5 border-t border-neutral-800 bg-darkest px-4 py-3">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={28}
          height={28}
          unoptimized
          className="h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dark text-xs font-semibold text-light/70">
          {initial}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium tracking-wide text-light/90">{display}</div>
        {email ? <div className="truncate text-[10px] tracking-wide text-light/40">{email}</div> : null}
      </div>
      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
    </div>
  )
}
