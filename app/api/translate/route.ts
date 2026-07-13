import { NextResponse } from 'next/server'
import { processUnprocessedAlerts } from '@/src/lib/translation/translation'

// This route can be called:
// 1. By the ingest cron route after saving new alerts (chained call)
// 2. By Vercel Cron on its own schedule (add to vercel.json if needed)
// 3. Manually during development for testing

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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