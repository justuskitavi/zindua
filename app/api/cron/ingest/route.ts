import { NextResponse } from 'next/server'
import { runIngestion } from '@/src/lib/ingestion/ingest'



export async function GET(request: Request) {  
  const authHeader = request.headers.get('authorization')
  const vercelCron = request.headers.get('x-vercel-cron')
  const secret = process.env.CRON_SECRET

  // Allow requests that either present the secret or originate from Vercel Cron
  if (authHeader !== `Bearer ${secret}` && vercelCron !== 'true') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron] ingestion started')
  const start = Date.now()

  try {
    const results = await runIngestion()
    const duration = Date.now() - start

    const totalSaved = results.reduce((sum, r) => sum + r.saved, 0)
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0)
    const errors = results.filter(r => r.error)

    console.log(`[cron] ingestion complete in ${duration}ms — ${totalSaved} saved, ${totalSkipped} skipped`)
    if (errors.length) {
      console.error('[cron] sources with errors:', errors)
    }

    return NextResponse.json({
      ok: true,
      duration_ms: duration,
      results,
      summary: { saved: totalSaved, skipped: totalSkipped },
    })
  } catch (err) {
    console.error('[cron] ingestion failed:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}