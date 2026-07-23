import { NextResponse } from 'next/server'
import { processUnprocessedAlerts } from '@/src/lib/translation/translation'

export async function GET(request: Request) {
  console.log('[cron] translation started')
  const start = Date.now()

  try {
    const result = await processUnprocessedAlerts()
    const duration = Date.now() - start

    console.log(`[cron] translation complete in ${duration}ms`, result)

    return NextResponse.json({
      ok: true,
      duration_ms: duration,
      ...result,
    })
  } catch (err) {
    console.error('[cron] translation failed:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}