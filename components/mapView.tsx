'use client'

import { useEffect, useRef } from 'react'

interface Alert {
  id: string
  title: string
  source : string
  severity: 'watch' | 'warning' | 'emergency'
  hazardType: string
  countryCode: string
  region: string | null
  stats: {
    total: number
    sent: number
    confirmed: number
    needsHelp: number
  }
}

interface MapViewProps {
  alerts: Alert[]
  selectedAlert: Alert | null
  onSelectAlert: (alert: Alert | null) => void
}

// Approximate centroids for IGAD countries
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  KE: [-0.023559, 37.906193],
  ET: [9.145, 40.489673],
  SO: [5.152149, 46.199616],
  SS: [6.877, 31.307],
  UG: [1.373333, 32.290275],
  DJ: [11.825138, 42.590275],
  ER: [15.179384, 39.782334],
  SD: [12.862807, 30.217636],
}

const SEVERITY_COLORS: Record<string, string> = {
  emergency: '#E24B4A',
  warning:   '#EF9F27',
  watch:     '#378ADD',
}

function getAlertPosition(alert: Alert): [number, number] | null {
  const coords = COUNTRY_CENTROIDS[alert.countryCode]
  if (!coords) return null

  const hashSource = `${alert.id}-${alert.countryCode}`
  let hash = 0
  for (let i = 0; i < hashSource.length; i += 1) {
    hash = (hash << 5) - hash + hashSource.charCodeAt(i)
  }

  const jitter = (((hash >>> 0) % 1000) - 500) / 1000 * 1.2
  return [coords[0] + jitter, coords[1] + jitter]
}

export default function MapView({ alerts, selectedAlert, onSelectAlert }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  useEffect(() => {
    const container = mapRef.current
    if (!container) return

    let cancelled = false
    let map: any = null

    const cleanupMap = () => {
      if (mapInstanceRef.current?.map) {
        mapInstanceRef.current.map.remove()
      }
      mapInstanceRef.current = null
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
    }

    if ((container as any)._leaflet_id != null) {
      cleanupMap()
    }

    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return

      if ((mapRef.current as any)._leaflet_id != null) {
        return
      }

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      map = L.map(mapRef.current!, {
        center: [-20, 35],   // center on IGAD region
        zoom: 5,
        zoomControl: true,
        attributionControl: false,
      })

      // Dark tile layer from CartoDB
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
        { maxZoom: 12 }
      ).addTo(map)

      // Country name labels layer
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
        { maxZoom: 12, opacity: 0.6 }
      ).addTo(map)

      mapInstanceRef.current = { map, L }
    }).catch(error => {
      console.error('Failed to initialize map', error)
    })

    return () => {
      cancelled = true
      cleanupMap()
    }
  }, [])

  // Update markers when alerts change
  useEffect(() => {
    if (!mapInstanceRef.current) return
    const { map, L } = mapInstanceRef.current

    // Clear existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    alerts.forEach(alert => {
      const position = getAlertPosition(alert)
      if (!position) return

      const color = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.watch
      const isSelected = selectedAlert?.id === alert.id
      const [lat, lng] = position

      // SVG circle marker
      const svgIcon = L.divIcon({
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `
          <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
            <circle cx="14" cy="14" r="12" fill="${color}" opacity="0.2"/>
            <circle cx="14" cy="14" r="7" fill="${color}" opacity="${isSelected ? 1 : 0.75}"/>
            ${isSelected ? `<circle cx="14" cy="14" r="12" fill="none" stroke="${color}" stroke-width="2"/>` : ''}
          </svg>
        `,
      })

      const marker = L.marker([lat, lng], { icon: svgIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:180px">
            <p style="font-size:12px;font-weight:600;margin:0 0 4px">${alert.title}</p>
            <p style="font-size:11px;color:#666;margin:0 0 6px">${alert.countryCode} · ${alert.source?.toUpperCase() ?? ''}</p>
            <p style="font-size:11px;margin:0">
              ${alert.stats.confirmed}/${alert.stats.total} confirmed
              ${alert.stats.needsHelp > 0 ? `· <span style="color:#E24B4A">${alert.stats.needsHelp} need help</span>` : ''}
            </p>
          </div>
        `, {
          closeButton: false,
          className: 'zindua-popup',
        })
        .on('click', () => onSelectAlert(alert))

      markersRef.current.push(marker)
    })
  }, [alerts, selectedAlert, onSelectAlert])

  // Pan to selected alert
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedAlert) return
    const position = getAlertPosition(selectedAlert)
    if (!position) return
    mapInstanceRef.current.map.flyTo(position, 6, { duration: 1 })
  }, [selectedAlert])

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <style>{`
        .zindua-popup .leaflet-popup-content-wrapper {
          background: #18181b;
          border: 1px solid #3f3f46;
          border-radius: 8px;
          color: #e4e4e7;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .zindua-popup .leaflet-popup-tip {
          background: #18181b;
        }
        .leaflet-control-zoom {
          border: 1px solid #3f3f46 !important;
          border-radius: 6px !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          background: #18181b !important;
          color: #a1a1aa !important;
          border-bottom: 1px solid #3f3f46 !important;
        }
        .leaflet-control-zoom a:hover {
          background: #27272a !important;
          color: #fff !important;
        }
      `}</style>
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '420px' }} />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 text-xs z-1000">
        <p className="text-zinc-500 mb-2 uppercase tracking-wider text-[10px]">Severity</p>
        {[
          { label: 'Emergency', color: '#E24B4A' },
          { label: 'Warning',   color: '#EF9F27' },
          { label: 'Watch',     color: '#378ADD' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-zinc-400">{label}</span>
          </div>
        ))}
      </div>
    </>
  )
}