import { Suspense } from 'react'
import { LoginForm } from '../../../components/pd/auth/LoginForm'

export const metadata = { title: 'Sign in · Orchentra' }

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
