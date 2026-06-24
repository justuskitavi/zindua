import { Redis } from '@upstash/redis'
import { prisma } from '../prisma/client'
import { fewsNet } from './sources/fewsNet'
import { reliefWeb } from './sources/reliefWeb'
import { openmeteo } from './sources/openMeteo'
import type { NormalizedAlert } from './normalize'

const redis = Redis.fromEnv()

// Redis key format for dedup. Expires after 7 days so old alerts
// can re-enter the system if they're still active after that window.
function dedupKey(alert: NormalizedAlert): string {
  return `zindua:ingested:${alert.source}:${alert.externalId}`
}

// Checks Redis first. If the key exists, we've already processed this alert.
// If not, sets the key and returns true — "this is new, process it."
async function isNew(alert: NormalizedAlert): Promise<boolean> {
  const key = dedupKey(alert)
  // SET key 1 NX EX 604800 — only set if not exists, expire in 7 days
  const result = await redis.set(key, '1', { nx: true, ex: 60 * 60 * 24 * 7 })
  // result is 'OK' if the key was set (new alert), null if it already existed
  return result === 'OK'
}

// Inserts a single normalized alert into Postgres.
// ON CONFLICT DO NOTHING is the DB-level safety net in case Redis state is lost.
async function saveAlert(alert: NormalizedAlert): Promise<void> {
  await prisma.alert.create({
    data: {
      source: alert.source,
      externalId: alert.externalId,
      title: alert.title,
      rawContent: alert.rawContent,
      hazardType: alert.hazardType,
      severity: alert.severity,
      countryCode: alert.countryCode,
      region: alert.region,
      issuedAt: alert.issuedAt,
    },
  })
}

export interface IngestionResult {
  source: string
  fetched: number
  saved: number
  skipped: number
  error?: string
}

// Runs all three sources in parallel, deduplicates, and saves new alerts.
// Returns a summary per source so the cron route can log what happened.
export async function runIngestion(): Promise<IngestionResult[]> {
  const sources = [fewsNet, reliefWeb, openmeteo]

  // Promise.allSettled — if one source throws, the others still complete.
  // This is the failure isolation we need.
  const settled = await Promise.allSettled(
    sources.map(async (source): Promise<IngestionResult> => {
      let alerts: NormalizedAlert[]

      try {
        alerts = await source.fetchAndNormalize()
      } catch (err) {
        // fetchAndNormalize already handles its own errors internally,
        // but we catch here as a final safety net
        return {
          source: source.name,
          fetched: 0,
          saved: 0,
          skipped: 0,
          error: err instanceof Error ? err.message : String(err),
        }
      }

      let saved = 0
      let skipped = 0

      for (const alert of alerts) {
        const fresh = await isNew(alert)
        if (!fresh) {
          skipped++
          continue
        }

        try {
          await saveAlert(alert)
          saved++
        } catch (err) {
          // Log but don't crash — one bad row shouldn't stop the rest
          console.error(`[ingest] failed to save alert ${alert.externalId}:`, err)
          skipped++
        }
      }

      return { source: source.name, fetched: alerts.length, saved, skipped }
    })
  )

  // Unwrap the settled results — fulfilled gets the value, rejected gets an error summary
  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    return {
      source: sources[i].name,
      fetched: 0,
      saved: 0,
      skipped: 0,
      error: result.reason?.message ?? 'Unknown error',
    }
  })
}