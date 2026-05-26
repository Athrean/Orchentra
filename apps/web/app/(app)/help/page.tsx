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
    <div className="max-w-3xl mx-auto px-8 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-wider text-light">Help</h1>
        <p className="mt-1 text-sm text-light/60 tracking-wide">
          Press <Kbd>⌘</Kbd> <Kbd>/</Kbd> for the keyboard shortcut sheet.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-light/60">Overlays</h2>
        <div className="flex gap-3">
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
        <p className="text-sm text-light/70 tracking-wide">
          Modals are 8px-radius, no drop shadow except the floating shadow-md, and they trap focus. Press Esc to close.
        </p>
      </Modal>

      <Drawer open={drawer} onOpenChange={setDrawer} title="Example drawer">
        <p className="text-sm text-light/70 tracking-wide">
          Drawers slide in from the right and are 24rem wide. Good for detail panels.
        </p>
      </Drawer>

      <ShortcutSheet open={shortcut} onOpenChange={setShortcut} />
    </div>
  )
}
