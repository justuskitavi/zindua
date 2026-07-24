import { NextResponse } from "next/server";
import { processUnrelayedAlerts } from "@/src/lib/relay/relay";

export async function GET(request : Request) {

    console.log(`[cron] relay started`)
    const start = Date.now()

    try {
        const result = await processUnrelayedAlerts()

        const duration = Date.now() - start

        console.log(`[cron] relay complete in ${duration} ms`, result)

        return NextResponse.json({ ok : true, duration_ms : duration, ...result })
    } catch (err) {
        console.error(`[cron] relay failed : `, err)
        return NextResponse.json({ ok : false, error : err instanceof Error ? err.message : String(err) }, { status : 500})
    }
}

