'use client'

import type { Alert as DashboardAlert } from './mapView'

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

interface DashboardRightPanelProps {
  alerts: DashboardAlert[]
  escalations: Escalation[]
  activeTab: 'alerts' | 'escalations'
  selectedAlertId: string | null
  onTabChange: (tab: 'alerts' | 'escalations') => void
  onSelectAlert: (alert: DashboardAlert | null) => void
  timeAgo: (dateStr: string) => string
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
  if (stats.total === 0) {
    return <p className="text-[10px] text-zinc-600 mt-1">No focal points matched</p>
  }

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

function AlertCard({
  alert,
  selected,
  onClick,
  timeAgo,
}: {
  alert: DashboardAlert
  selected: boolean
  onClick: () => void
  timeAgo: (dateStr: string) => string
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

export default function DashboardRightPanel({
  alerts,
  escalations,
  activeTab,
  selectedAlertId,
  onTabChange,
  onSelectAlert,
  timeAgo,
}: DashboardRightPanelProps) {
  return (
    <div className="w-75 min-w-70 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-y-auto min-h-0">
      <div className="flex border-b border-zinc-800">
        {(['alerts', 'escalations'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
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

      <div className="flex-1 min-h-0 overflow-y-auto">
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
                selected={selectedAlertId === alert.id}
                onClick={() => onSelectAlert(selectedAlertId === alert.id ? null : alert)}
                timeAgo={timeAgo}
              />
            ))
          )
        ) : escalations.length === 0 ? (
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
        )}
      </div>
    </div>
  )
}
