import { prisma } from '../prisma/client'
import { sendSMS } from './sms/sms'

const REPLY_INSTRUCTIONS: Record<string, string> = {
  en: 'Reply: 1=Got it 2=Acting 3=Need help',
  sw: 'Jibu: 1=Nimeona 2=Ninaenda 3=Nahitaji msaada',
  so: 'Jawaab: 1=Helay 2=Wax qabanaya 3=Caawimo',
  am: 'መልስ: 1=ደረሰኝ 2=እያደረኩ 3=እርዳታ',
  om: 'Deebii: 1=Argadhe 2=Hojjedha 3=Gargaarsa',
}

export interface RelayResult {
    alertId : string
    focalPointsMatched : number
    sent : number
    received : number
    failed : number
}

export async function relayAlert(alertId : string) : Promise<RelayResult> {
    const result : RelayResult = {
        alertId,
        focalPointsMatched : 0,
        sent : 0,
        received : 0,
        failed : 0,
    }

    const alert = await prisma.alert.findUnique({
        where : { id : alertId},
        include : {
            translations : true,
            notifications : { select : { focalPointId : true } },
        },
    })

    if (!alert) {
        console.error(`[relay] alert ${alertId} not found`)
        return result
    }

    const focaPoints = await prisma.focalPoint.findMany({
        where : { countryCode : alert.countryCode, active : true }
    })

    if (focaPoints.length === 0) {
        console.error(`[relay] no focalpoints for country ${alert.countryCode}`)
        return result
    }

    result.focalPointsMatched = focaPoints.length

    const alreadyNotified = new Set(alert.notifications.map(n => n.focalPointId))

    const translationMap = Object.fromEntries(
        alert.translations.map(t => [t.language, t.smsContent])
    )

    for(const fp of focaPoints) {

        if (alreadyNotified.has(fp.id)){
            console.log(`[relay] ${fp.phone} already notied for alert ${alertId}, skipping....`)
            continue
        }

        const smsContent = translationMap[fp.language] ?? translationMap['en'] ?? alert.title

        const replyInstructions = REPLY_INSTRUCTIONS[fp.language] ?? REPLY_INSTRUCTIONS['en']

        const maxContentLength = 120 - replyInstructions.length - 1

        const truncatedContent = smsContent.length > maxContentLength ? smsContent.slice(0, maxContentLength - 3) + '...' : smsContent

        const finalMessage = `${truncatedContent}\n${replyInstructions}`

        const notification = await prisma.notifications.create({
            data : { alertId : alert.id, focalPointId : fp.id, status : 'queued' }
        })

        const SMSResult = await sendSMS(fp.phone, finalMessage)

        await prisma.notifications.update({
            where : { id : notification.id },
            data : { status : SMSResult.status, messageId : SMSResult.messageId, sentAt : SMSResult.status === 'sent' ? new Date() : null }
        })

        if (SMSResult.status === 'sent') {
            result.sent ++
        } else{
            result.failed ++
            console.error(`[relay] sms failed to ${fp.phone} : ${SMSResult.error}`)
        }
    }

    console.log(`[relay] alert ${alertId} — matched: ${result.focalPointsMatched}, sent: ${result.sent}, failed: ${result.failed}`)

    return result
}

export async function processUnrelayedAlerts() : Promise <{ processed : number; totalSent : number; totalFailed : number; }> {
    const unrelayed = await prisma.alert.findMany({
        where : { processed : true, notifications : { none : {} } },
        include: { translations : true },
        orderBy : { ingestedAt : 'asc' },
        take : 10,
    })

    if (unrelayed.length === 0) {
        console.log(`[relay] no unrelayed alerts found`)
        return { processed : 0, totalSent : 0, totalFailed : 0}
    }

    console.log(`[relay] Processing ${unrelayed.length} unprocessed alerts.`)

    let processed = 0, totalFailed = 0, totalSent = 0

    for (const alert of unrelayed) {
        if (alert.translations.length === 0) {
            console.log(`[relay] alert ${alert.id} got no translations yet, skipping...`)
            continue
        }

        const result = await relayAlert(alert.id)
        processed ++
        totalSent += result.sent
        totalFailed += result.failed
    }

    return { processed, totalSent, totalFailed }
}