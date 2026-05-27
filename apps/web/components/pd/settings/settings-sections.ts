import { Bell, Bot, CircleUserRound, KeyRound, PlugZap, Siren, type LucideIcon } from 'lucide-react'

export interface SettingsSectionItem {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

export const settingsSections: SettingsSectionItem[] = [
  {
    href: '/settings/profile',
    label: 'Profile',
    description: 'Identity, avatar, and account basics.',
    icon: CircleUserRound,
  },
  {
    href: '/settings/ai-providers',
    label: 'AI Providers',
    description: 'Personal model credentials and defaults.',
    icon: Bot,
  },
  {
    href: '/settings/alerts',
    label: 'Alerts',
    description: 'Rules, thresholds, and alert history.',
    icon: Siren,
  },
  {
    href: '/settings/api-keys',
    label: 'API Keys',
    description: 'Project tokens for external automation.',
    icon: KeyRound,
  },
  {
    href: '/settings/integrations',
    label: 'Integrations',
    description: 'Connected tools and install state.',
    icon: PlugZap,
  },
  {
    href: '/settings/notifications',
    label: 'Notifications',
    description: 'Delivery channels and quiet hours.',
    icon: Bell,
  },
]
