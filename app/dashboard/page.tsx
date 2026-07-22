'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

// Leaflet must be dynamically imported — it accesses window on load
const MapView = dynamic(() => import('@/components/mapView'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────

interface AlertStat {
  total: number
  sent: number
  confirmed: number
  acting: number
  needsHelp: number
}

interface Alert {
  id: string
  title: string
  source: string
  hazardType: string
  severity: 'watch' | 'warning' | 'emergency'
  countryCode: string
  region: string | null
  issuedAt: string
  ingestedAt: string
  processed: boolean
  translationCount: number
  stats: AlertStat
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
  alerts: Alert[]
  escalations: Escalation[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Sub-components ─────────────────────────────────────────────────────────

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
  alert: Alert
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
        <span>{timeAgo(alert.ingestedAt)}</span>
        {!alert.processed && (
          <span className="text-amber-500">· translating...</span>
        )}
      </div>
      <ConfirmBar stats={alert.stats} />
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [activeTab, setActiveTab] = useState<'alerts' | 'escalations'>('alerts')
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

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
    // Poll every 60 seconds for fresh data
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
    <div className="flex flex-col min-h-screen bg-black text-white font-sans">

      {/* Top bar */}
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

      {/* Escalation banner */}
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

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3 px-5 pt-4 pb-3">
        <MetricCard label="Active alerts" value={metrics.totalAlerts} />
        <MetricCard label="Focal points notified" value={metrics.totalNotified} accent="success" />
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

      {/* Main content */}
      <div className="flex flex-1 gap-3 px-5 pb-5 overflow-hidden" style={{ minHeight: 0 }}>

        {/* Map */}
        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden relative min-h-105">
          <MapView
            alerts={alerts}
            selectedAlert={selectedAlert}
            onSelectAlert={ (alert) => setSelectedAlert}
          />
        </div>

        {/* Right panel */}
        <div className="w-75 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-zinc-800">
            {(['alerts', 'escalations'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-white border-b-2 border-amber-500'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab === 'alerts' ? `Alerts (${alerts.length})` : `Escalations (${escalations.length})`}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'alerts' ? (
              alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-sm gap-2 p-8 text-center">
                  <span className="text-3xl">📡</span>
                  <p>No alerts yet.</p>
                  <p className="text-xs">Run the pipeline to ingest data.</p>
                </div>
              ) : (
                alerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    selected={selectedAlert?.id === alert.id}
                    onClick={() => setSelectedAlert(
                      selectedAlert?.id === alert.id ? null : alert
                    )}
                  />
                ))
              )
            ) : (
              escalations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-sm gap-2 p-8 text-center">
                  <span className="text-3xl">✅</span>
                  <p>No escalations.</p>
                  <p className="text-xs">All focal points are accounted for.</p>
                </div>
              ) : (
                escalations.map(esc => (
                  <div key={esc.id} className="px-4 py-3 border-b border-zinc-800">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-[12px] font-medium text-red-400">{esc.focalPointName}</p>
                      <SeverityBadge severity={esc.alertSeverity} />
                    </div>
                    <p className="text-[11px] text-zinc-400 mb-1">{esc.alertTitle}</p>
                    <p className="text-[11px] text-zinc-600">
                      {esc.focalPointPhone} · {esc.alertCountry}
                      {esc.repliedAt && ` · ${timeAgo(esc.repliedAt)}`}
                    </p>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}