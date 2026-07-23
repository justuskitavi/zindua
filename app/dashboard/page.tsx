'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import DashboardRightPanel from './rightPanel'
import FocalPointsPanel from './focalPointsPanel'
import type { Alert as DashboardAlert } from './mapView'

const MapView = dynamic(() => import('./mapView'), { ssr: false })

interface AlertStat {
  total: number
  sent: number
  confirmed: number
  acting: number
  needsHelp: number
}

interface Escalation {
  id: string
  focalPointName: string
  focalPointPhone: string
  alertTitle: string
  alertCountry: string
  alertSeverity: string
  repliedAt: string | null
}

interface Metrics {
  totalAlerts: number
  totalNotified: number
  confirmationRate: number
  totalEscalations: number
  activeFocalPoints: number
}

interface DashboardData {
  metrics: Metrics
  alerts: DashboardAlert[]
  escalations: Escalation[]
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function hazardIcon(hazard: string): string {
  switch (hazard) {
    case 'flood': return '🌊'
    case 'drought': return '🏜️'
    case 'wildfire': return '🔥'
    case 'extreme_heat': return '🌡️'
    case 'displacement': return '🏃'
    default: return '⚠️'
  }
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    emergency: 'bg-red-500/15 text-red-400 border border-red-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    watch: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${styles[severity] ?? styles.watch}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  )
}

function ConfirmBar({ stats }: { stats: AlertStat }) {
  if (stats.total === 0) return (
    <p className="text-[10px] text-zinc-600 mt-1">No focal points matched</p>
  )
  const pct = Math.round((stats.confirmed / stats.total) * 100)
  return (
    <div className="mt-2">
      <div className="h-0.75 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-zinc-600 mt-1">
        {stats.confirmed}/{stats.total} confirmed
        {stats.needsHelp > 0 && (
          <span className="text-red-400 ml-2">· {stats.needsHelp} need help</span>
        )}
      </p>
    </div>
  )
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: 'danger' | 'warning' | 'success'
}) {
  const colors = {
    danger: 'text-red-400',
    warning: 'text-amber-400',
    success: 'text-emerald-400',
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-medium ${accent ? colors[accent] : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

function AlertCard({
  alert,
  selected,
  onClick,
}: {
  alert: DashboardAlert
  selected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 border-b border-zinc-800 cursor-pointer transition-colors ${
        selected ? 'bg-zinc-800/60' : 'hover:bg-zinc-500/60'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[12px] font-medium text-zinc-200 leading-snug flex-1">
          {hazardIcon(alert.hazardType)} {alert.title}
        </p>
        <SeverityBadge severity={alert.severity} />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
        <span>{alert.countryCode}</span>
        <span>·</span>
        <span className="uppercase">{alert.source}</span>
        <span>·</span>
        <span>{timeAgo(alert.ingestedAt ?? new Date().toISOString())}</span>
        {!alert.processed && (
          <span className="text-amber-500">· translating...</span>
        )}
      </div>
      <ConfirmBar stats={alert.stats} />
    </div>
  )
}


export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(null)
  const [activeTab, setActiveTab] = useState<'alerts' | 'escalations'>('alerts')
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [panelOpen, setPanelOpen] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: DashboardData = await res.json()
      setData(json)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-zinc-400 text-sm">
        Loading Zindua dashboard...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-red-400 text-sm">
        {error ?? 'No data available'}
      </div>
    )
  }

  const { metrics, alerts, escalations } = data

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-black text-white font-sans">

      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center text-black text-xs font-bold">Z</div>
          <span className="font-medium text-sm tracking-tight">Zindua</span>
          <span className="text-zinc-600 text-sm">Early Warning · IGAD Region</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>Updated {timeAgo(lastUpdated.toISOString())}</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live</span>
          </div>
          <button
            onClick={fetchData}
            className="px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Refresh
          </button>
        </div>
      </header>

      {metrics.totalEscalations > 0 && (
        <div
          className="flex items-center gap-2 px-5 py-2.5 bg-red-950/40 border-b border-red-900/50 text-red-400 text-xs cursor-pointer hover:bg-red-950/60 transition-colors"
          onClick={() => setActiveTab('escalations')}
        >
          <span className="text-red-400">⚠</span>
          <span className="font-medium">{metrics.totalEscalations} focal point{metrics.totalEscalations > 1 ? 's' : ''} need{metrics.totalEscalations === 1 ? 's' : ''} help</span>
          <span className="text-red-600">· Click to view escalation queue →</span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 px-5 pt-4 pb-3">
        <MetricCard label="Active alerts" value={metrics.totalAlerts} />
        <div onClick={() => setPanelOpen(true)} className="cursor-pointer hover:border-amber-500/50 transition-colors" >
        <MetricCard
          label="Focal points notified"
          value={metrics.totalNotified}
          accent="success"
        />
      </div>
        <MetricCard
          label="Confirmation rate"
          value={`${metrics.confirmationRate}%`}
          accent={metrics.confirmationRate >= 60 ? 'success' : 'warning'}
        />
        <MetricCard
          label="Escalations"
          value={metrics.totalEscalations}
          accent={metrics.totalEscalations > 0 ? 'danger' : undefined}
        />
      </div>

      <div className="flex flex-1 gap-3 px-5 pb-5 overflow-hidden relative" style={{ minHeight: 0 }}>

        <div className={`flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden relative min-h-105 z-10 transition-all duration-200 ${panelOpen ? 'blur-sm' : ''}`}>
          <MapView
            alerts={alerts}
            selectedAlert={selectedAlert}
            onSelectAlert={(alert) => setSelectedAlert(alert)}
          />
        </div>

        <div className={`transition-all duration-200 ${panelOpen ? 'blur-sm' : ''}`}>
          <DashboardRightPanel
            alerts={alerts}
            escalations={escalations}
            activeTab={activeTab}
            selectedAlertId={selectedAlert?.id ?? null}
            onTabChange={setActiveTab}
            onSelectAlert={(alert) => setSelectedAlert(alert)}
            timeAgo={timeAgo}
          />
        </div>
        <FocalPointsPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          onDataChange={fetchData}
        />
      </div>
    </div>
  )
}