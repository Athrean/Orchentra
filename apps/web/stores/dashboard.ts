import { create } from 'zustand'

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'all'

interface DashboardStore {
  selectedIncidentId: string | null
  period: Period
  setSelectedIncidentId: (id: string | null) => void
  setPeriod: (period: Period) => void
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  selectedIncidentId: null,
  period: 'all',
  setSelectedIncidentId: (id) => set({ selectedIncidentId: id }),
  setPeriod: (period) => set({ period }),
}))
