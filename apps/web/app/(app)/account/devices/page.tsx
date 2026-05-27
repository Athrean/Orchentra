import { redirect } from 'next/navigation'

export const metadata = { title: 'CLI devices · Orchentra' }

export default function DevicesPage() {
  redirect('/settings/devices')
}
