'use client'

import * as React from 'react'
import { Modal } from '../overlay/Modal'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateTeamModal({ open, onOpenChange }: Props) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')

  function close() {
    onOpenChange(false)
    setName('')
    setDescription('')
  }

  function handleOpenChange(next: boolean) {
    if (!next) close()
    else onOpenChange(true)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    // Teams have no backend yet — close on create until the org service lands.
    close()
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Create New Team"
      description="Add a new team to your organization"
    >
      <form onSubmit={handleCreate} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="team-name">Team Name</Label>
          <Input
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter team name"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="team-description">Description</Label>
          <textarea
            id="team-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the team's purpose"
            rows={3}
            className="w-full resize-y rounded-[8px] bg-pg-surface-0 px-3 py-2 text-sm tracking-wide text-pg-text-0 shadow-[0_0_0_1px_rgba(20,20,18,0.08)] outline-none transition-shadow placeholder:text-pg-text-mute/60 focus-visible:shadow-[0_0_0_1px_rgba(28,126,84,0.35)]"
          />
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            Create Team
          </Button>
        </div>
      </form>
    </Modal>
  )
}
