import { redirect } from 'next/navigation'

export const metadata = { title: 'Account · Orchentra' }

export default function AccountPage() {
  redirect('/settings')
}
