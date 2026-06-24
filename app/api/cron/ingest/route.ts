import { NextResponse } from 'next/server'
import { runIngestion } from '@/src/lib/ingestion/ingest'

// This route is called by Vercel Cron on a schedule defined in vercel.json.
// It can also be called manually during development via:
//   curl -H "Authorization: Bearer your_cron_secret" http://localhost:3000/api/cron/ingest

export async function GET(request: Request) {
  // Protect the route so only Vercel's cron runner (or you) can trigger it.
  // In production, Vercel automatically sends the CRON_SECRET as a Bearer token.
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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