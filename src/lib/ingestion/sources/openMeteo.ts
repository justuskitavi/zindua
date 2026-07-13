import {
  type IngestionSource,
  type NormalizedAlert,
  precipToSeverity,
  tempToSeverity,
} from '../normalize'
 
const OPENMETEO_BASE = 'https://api.open-meteo.com/v1/forecast'

const MONITORED_LOCATIONS = [
  // Kenya — arid/semi-arid counties most vulnerable to climate shocks
  { name: 'Turkana', country: 'KE', lat: 3.1191, lon: 35.5975 },
  { name: 'Marsabit', country: 'KE', lat: 2.3284, lon: 37.9899 },
  { name: 'Mandera', country: 'KE', lat: 3.9366, lon: 41.8670 },
  { name: 'Wajir', country: 'KE', lat: 1.7471, lon: 40.0573 },
  { name: 'Garissa', country: 'KE', lat: -0.4532, lon: 39.6460 },
  // Ethiopia
  { name: 'Afar', country: 'ET', lat: 11.7557, lon: 40.9996 },
  { name: 'Somali Region', country: 'ET', lat: 6.8, lon: 44.5 },
  { name: 'Oromia', country: 'ET', lat: 7.5460, lon: 40.6346 },
  // Somalia
  { name: 'Banadir', country: 'SO', lat: 2.0469, lon: 45.3182 },
  { name: 'Bay', country: 'SO', lat: 2.7784, lon: 43.5014 },
  // South Sudan
  { name: 'Jonglei', country: 'SS', lat: 7.0, lon: 32.0 },
  { name: 'Unity State', country: 'SS', lat: 9.0, lon: 29.5 },
  // Uganda
  { name: 'Karamoja', country: 'UG', lat: 3.0, lon: 34.5 },
  // Djibouti
  { name: 'Djibouti', country: 'DJ', lat: 11.8251, lon: 42.5903 },
]
 

const PRECIP_THRESHOLD_MM = 30
const TEMP_THRESHOLD = 40

interface OpenMeteoResponse {
    daily: {
    time: string[]
    precipitation_sum: number[]
    temperature_2m_max: number[]
}
}

export const openMeteo: IngestionSource = {
  name: 'openmeteo',
 
  async fetchAndNormalize(): Promise<NormalizedAlert[]> {
    const results: NormalizedAlert[] = []
 
    for (const loc of MONITORED_LOCATIONS) {
      let data: OpenMeteoResponse
 
      try {
        const params = new URLSearchParams({
          latitude: String(loc.lat),
          longitude: String(loc.lon),
          daily: 'precipitation_sum,temperature_2m_max',
          forecast_days: '7',
          timezone: 'Africa/Nairobi',
        })
 
        const res = await fetch(`${OPENMETEO_BASE}?${params}`, {
          signal: AbortSignal.timeout(10_000),
        })
 
        if (!res.ok) {
          console.error(`[openmeteo] HTTP ${res.status} for ${loc.name}`)
          continue
        }
 
        data = await res.json()
      } catch (err) {
        console.error(`[openmeteo] fetch failed for ${loc.name}:`, err)
        continue
      }
 
      const { time, precipitation_sum, temperature_2m_max } = data.daily
 
      // Walk each forecast day and generate an alert if any threshold is crossed.
      // We only alert on days 1–3 (near-term actionable window) — day 0 is today,
      // days 4–6 are too uncertain to be worth notifying communities about.
      for (let i = 1; i <= 3; i++) {
        const date = time[i]
        const precip = precipitation_sum[i]
        const temp = temperature_2m_max[i]
 
        if (precip >= PRECIP_THRESHOLD_MM) {
          results.push({
            source: 'openmeteo',
            // external_id encodes location + date + hazard so the same forecast
            // day doesn't get re-ingested on the next cron run
            externalId: `${loc.country}-${loc.name.replace(/\s/g, '_')}-flood-${date}`,
            title: `Heavy rainfall forecast — ${loc.name}, ${date}`,
            rawContent: `${precip.toFixed(1)}mm of rainfall is forecast for ${loc.name} on ${date}. This exceeds the threshold for flash flooding in this area.`,
            hazardType: 'flood',
            severity: precipToSeverity(precip),
            countryCode: loc.country,
            region: loc.name,
            issuedAt: new Date(),
          })
        }
 
        if (temp >= TEMP_THRESHOLD) {
          results.push({
            source: 'openmeteo',
            externalId: `${loc.country}-${loc.name.replace(/\s/g, '_')}-heat-${date}`,
            title: `Extreme heat forecast — ${loc.name}, ${date}`,
            rawContent: `Maximum temperature of ${temp.toFixed(1)}°C is forecast for ${loc.name} on ${date}. This poses risk to livestock, crops, and vulnerable people.`,
            hazardType: 'extreme_heat',
            severity: tempToSeverity(temp),
            countryCode: loc.country,
            region: loc.name,
            issuedAt: new Date(),
          })
        }
      }
    }
 
    return results
  },
}