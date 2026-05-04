import React from 'react'
import { render } from 'ink'
import {
  createTrustStore,
  defaultTrustStorePath,
  enforceTrust,
  type TrustChoice,
  type TrustVerdict,
} from '@orchentra/cli-core'
import { TrustPrompt } from '../tui/components/TrustPrompt'

export interface GateTrustOptions {
  readonly cwd: string
  /** Override the persistence path (tests). */
  readonly storePath?: string
}

export async function gateTrust(opts: GateTrustOptions): Promise<TrustVerdict> {
  const store = createTrustStore({ filePath: opts.storePath ?? defaultTrustStorePath() })
  return enforceTrust({
    cwd: opts.cwd,
    store,
    askUser: askUserViaInk,
  })
}

async function askUserViaInk(cwd: string): Promise<TrustChoice> {
  return new Promise<TrustChoice>((resolve) => {
    let resolved = false
    const settle = (choice: TrustChoice): void => {
      if (resolved) return
      resolved = true
      resolve(choice)
      app.unmount()
    }
    const app = render(<TrustPrompt cwd={cwd} onChoose={settle} />, { exitOnCtrlC: true })
  })
}
