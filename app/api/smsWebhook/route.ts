import { NextResponse } from "next/server";
import { prisma } from '@/src/lib/prisma/client'

export async function POST(request : Request) {
    let from : string 
    let text : string

    try {
        const formData = await request.formData()
        from = formData.get('from') as string
        text = (formData.get('text') as string ?? '').trim()
    }catch {
        try{
            const json = await request.json()
            from = json.from
            text = (json.text ?? '').trim()
        }catch {
            return NextResponse.json({ error: 'Invalid request body'}, { status : 400})
        }
    }

    if (!from || !text) {
        return NextResponse.json({ error : 'Missing from or text'}, { status : 400 })
    }

    const replyCode = parseInt(text.charAt(0), 10)

    if (![1,2,3].includes(replyCode)) {
        console.log(`[webhook] Unrecognized reply from ${from} : "${text}"`)
        return NextResponse.json({ ok : true , note : 'Unrecognized reply' })
    }

    const focalPoint = await prisma.focalPoint.findUnique({ where: { phone : from } })

    if (!focalPoint) {
        console.log(`[webhook] Unknown phone number : ${from}`)
        return NextResponse.json({ ok : true, note : 'Unknown sender' })
    }

    const notification = await prisma.notifications.findFirst({ where : { focalPointId : focalPoint.id, replyCode : null, status : 'sent' }, orderBy : { sentAt : 'desc'}})

    if (!notification) {
        console.log(`[wenbook] No pending notifications for ${from}`)
        return NextResponse.json({ ok: true, note : 'No pending notification'})
    }

    await prisma.notifications.update({
        where : { id : notification.id },
        data : { replyCode, repliedAt : new Date(), status : 'delivered' }
    })

    const replyLabels : Record<number, string> = {
        1 : 'Received', 
        2 : 'Acting',
        3 : 'Needs help - ESCALATE'
    }

    console.log(`[webhook] ${from} replied ${replyCode} (${replyLabels[replyCode]}) for alert ${notification.alertId}`)

    if (replyCode === 3) {
        console.warn(`[webhook] 🚨 ESCALATION: ${focalPoint.name} (${from}) needs help — alert ${notification.alertId}`)
    }
    
    return NextResponse.json({ ok : true })
}