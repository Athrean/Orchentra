'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { StepIndicator } from './StepIndicator'
import { WelcomeStep } from './WelcomeStep'
import { InstallAppStep } from './InstallAppStep'
import { SelectReposStep } from './SelectReposStep'

export type OnboardingClientStep = 'welcome' | 'install_app' | 'select_repos'

const STEPS: { id: OnboardingClientStep; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'install_app', label: 'Install app' },
  { id: 'select_repos', label: 'Select repos' },
]

interface OnboardingShellProps {
  initialStep: OnboardingClientStep
}

export function OnboardingShell({ initialStep }: OnboardingShellProps) {
  const router = useRouter()
  const [step, setStep] = React.useState<OnboardingClientStep>(initialStep)
  const [busy, setBusy] = React.useState(false)

  async function advance(to: OnboardingClientStep | 'completed') {
    setBusy(true)
    try {
      const res = await fetch('/api/onboarding/advance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step: to }),
      })
      if (!res.ok) throw new Error(await res.text())
      if (to === 'completed') {
        router.push('/dashboard')
        router.refresh()
        return
      }
      setStep(to)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <StepIndicator steps={STEPS} current={step} />
      <div className="mt-10 flex flex-1 flex-col">
        {step === 'welcome' && <WelcomeStep busy={busy} onContinue={() => void advance('install_app')} />}
        {step === 'install_app' && <InstallAppStep onAdvance={() => void advance('select_repos')} />}
        {step === 'select_repos' && (
          <SelectReposStep
            onComplete={() => {
              router.push('/dashboard')
              router.refresh()
            }}
          />
        )}
      </div>
    </div>
  )
}
