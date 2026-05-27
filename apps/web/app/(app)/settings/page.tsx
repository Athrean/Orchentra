import { redirect } from 'next/navigation'

export const metadata = { title: 'Settings · Orchentra' }

export default function SettingsPage() {
  redirect('/settings/profile')
}
