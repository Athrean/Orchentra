import { AnimatePresence, m } from 'framer-motion'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { modelProfiles } from './data'

type ModelProfile = (typeof modelProfiles)[number]

export function ModelRail(): React.ReactNode {
  return (
    <ul className="profile-grid" aria-label="Supported model providers and families">
      {modelProfiles.map((profile) => (
        <li key={profile.id}>
          <ModelProfileCell profile={profile} />
        </li>
      ))}
    </ul>
  )
}

function ModelProfileCell({ profile }: { profile: ModelProfile }): React.ReactNode {
  const [modelIndex, setModelIndex] = useState(-1)
  const pointerInside = useRef(false)
  const label = modelIndex < 0 ? profile.provider : (profile.models[modelIndex] ?? profile.provider)

  function cycleModel(): void {
    setModelIndex((current) => (current + 1) % profile.models.length)
  }

  return (
    <button
      type="button"
      className="model-profile-cell"
      aria-label={`${profile.provider} models. Current: ${label}`}
      onMouseEnter={() => {
        pointerInside.current = true
        cycleModel()
      }}
      onMouseLeave={() => {
        pointerInside.current = false
      }}
      onFocus={() => {
        if (!pointerInside.current) cycleModel()
      }}
      onClick={(event) => {
        if (event.detail === 0) cycleModel()
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== 'mouse') cycleModel()
      }}
    >
      <AnimatePresence initial={false} mode="wait">
        <m.span
          className="model-profile-swap"
          key={label}
          initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -4, filter: 'blur(2px)' }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
        >
          <span className="model-profile-mark" aria-hidden="true">
            <Image src={profile.icon} alt="" width={26} height={26} />
          </span>
          <strong>{label}</strong>
        </m.span>
      </AnimatePresence>
    </button>
  )
}
