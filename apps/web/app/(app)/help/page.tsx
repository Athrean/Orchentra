'use client'

import * as React from 'react'
import { Modal } from '../../../components/pd/overlay/Modal'
import { Drawer } from '../../../components/pd/overlay/Drawer'
import { ShortcutSheet } from '../../../components/pd/overlay/ShortcutSheet'
import { Kbd } from '../../../components/pd/overlay/Kbd'
import { Button } from '../../../components/pd/ui/button'

export default function HelpPage() {
  const [modal, setModal] = React.useState(false)
  const [drawer, setDrawer] = React.useState(false)
  const [shortcut, setShortcut] = React.useState(false)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        setShortcut(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 pb-12">
      <header className="pt-8">
        <h1 className="text-2xl font-semibold tracking-tight text-pg-text-0">Help</h1>
        <p className="mt-1 text-sm text-pg-text-mute">
          Press <Kbd>⌘</Kbd> <Kbd>/</Kbd> for the keyboard shortcut sheet.
        </p>
      </header>

      <section className="surface space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-pg-text-0">Shortcuts and overlays</h2>
          <p className="mt-1 text-sm text-pg-text-mute">Open the same panels used across the product shell.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setModal(true)}>
            Open modal
          </Button>
          <Button variant="outline" onClick={() => setDrawer(true)}>
            Open drawer
          </Button>
          <Button variant="outline" onClick={() => setShortcut(true)}>
            Open shortcut sheet
          </Button>
        </div>
      </section>

      <Modal
        open={modal}
        onOpenChange={setModal}
        title="Example modal"
        description="A simple dialog for confirmations and small forms."
      >
        <p className="text-sm text-pg-text-mute tracking-wide">
          Modals use the same soft white surface as the rail popovers, and they trap focus. Press Esc to close.
        </p>
      </Modal>

      <Drawer open={drawer} onOpenChange={setDrawer} title="Example drawer">
        <p className="text-sm text-pg-text-mute tracking-wide">
          Drawers slide in from the right and are 24rem wide. Good for detail panels.
        </p>
      </Drawer>

      <ShortcutSheet open={shortcut} onOpenChange={setShortcut} />
    </div>
  )
}
