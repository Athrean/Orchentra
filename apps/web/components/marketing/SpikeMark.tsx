export function SpikeMark({ size = 18, className }: { size?: number; className?: string }): React.ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 0L13.4 9.6 23 11l-9.6 1.4L12 22l-1.4-9.6L1 11l9.6-1.4L12 0Z" />
    </svg>
  )
}
