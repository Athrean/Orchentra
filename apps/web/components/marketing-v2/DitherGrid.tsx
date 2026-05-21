// apps/web/components/marketing-v2/DitherGrid.tsx
export function DitherGrid() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="pg-dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.75" fill="var(--color-pg-grid-dot)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="var(--color-pg-surface-0)" />
      <rect width="100%" height="100%" fill="url(#pg-dots)" />
    </svg>
  )
}
