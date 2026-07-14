import { Redis } from '@upstash/redis'
import { prisma } from '../prisma/client'
import { gdacs } from './sources/gdacs'
import { openMeteo } from './sources/openMeteo'
import type { NormalizedAlert } from './normalize'

const redis = Redis.fromEnv()

function dedupKey(alert: NormalizedAlert): string {
  return `zindua:ingested:${alert.source}:${alert.externalId}`
}

async function isNew(alert: NormalizedAlert): Promise<boolean> {
  const key = dedupKey(alert)
  const result = await redis.set(key, '1', { nx: true, ex: 60 * 60 * 24 * 7 })
  
  return result === 'OK'
}

async function saveAlert(alert: NormalizedAlert): Promise<void> {  
    try {
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
    }catch(err: any) {
      if (err.code === 'P2002') return
      throw err
    }
    
  
}

export interface IngestionResult {
  source: string
  fetched: number
  saved: number
  skipped: number
  error?: string
}

export async function runIngestion(): Promise<IngestionResult[]> {
  const sources = [openMeteo, gdacs]

  const settled = await Promise.allSettled(
    sources.map(async (source): Promise<IngestionResult> => {
      let alerts: NormalizedAlert[]

      try {
        alerts = await source.fetchAndNormalize()
      } catch (err) {        
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
          console.error(`[ingest] failed to save alert ${alert.externalId}:`, err)
          skipped++
        }
      }

      return { source: source.name, fetched: alerts.length, saved, skipped }
    })
  )

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