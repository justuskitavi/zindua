import { NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma/client'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { phone, alertId, replyCode } = body

        if (![1, 2, 3].includes(replyCode)) {
        return NextResponse.json(
            { error: 'replyCode must be 1 (received), 2 (acting), or 3 (need help)' },
            { status: 400 }
        )
        }

        // Mode A: simulate a single focal point by phone number
        if (phone) {
        const result = await simulateSingleReply(phone, replyCode)
        return NextResponse.json(result)
        }

        // Mode B: simulate ALL focal points for a specific alert
        if (alertId) {
        const results = await simulateAllRepliesForAlert(alertId, replyCode)
        return NextResponse.json({ ok: true, simulated: results.length, results })
        }

        return NextResponse.json(
        { error: 'Provide either phone or alertId' },
        { status: 400 }
        )
    } catch (err) {
        console.error('[simulate]', err)
        return NextResponse.json({ error: 'Simulation failed' }, { status: 500 })
    }
    }

    async function simulateSingleReply(phone: string, replyCode: number) {
    const focalPoint = await prisma.focalPoint.findUnique({ where: { phone } })
    if (!focalPoint) {
        return { ok: false, error: `No focal point with phone ${phone}` }
    }

    const notification = await prisma.notifications.findFirst({
        where: {
        focalPointId: focalPoint.id,
        replyCode: null,
        status: { in: ['sent', 'queued'] },
        },
        orderBy: { createdAt: 'desc' },
        include: { alert: { select: { title: true } } },
    })

    if (!notification) {
        return { ok: false, error: `No pending notification for ${focalPoint.name}` }
    }

    await prisma.notifications.update({
        where: { id: notification.id },
        data: {
        replyCode,
        repliedAt: new Date(),
        status: 'delivered',
        },
    })

    const labels: Record<number, string> = { 1: 'Received', 2: 'Acting', 3: 'Needs help' }
    console.log(`[simulate] ${focalPoint.name} → reply ${replyCode} (${labels[replyCode]})`)

    return {
        ok: true,
        focalPoint: focalPoint.name,
        alert: (notification as any).alert?.title,
        replyCode,
        label: labels[replyCode],
    }
}

async function simulateAllRepliesForAlert(alertId: string, replyCode: number) {
    const notifications = await prisma.notifications.findMany({
        where: {
        alertId,
        replyCode: null,
        status: { in: ['sent', 'queued'] },
        },
        include: { focalPoint: true },
    })

    const results = []

    for (const notification of notifications) {
        await prisma.notifications.update({
        where: { id: notification.id },
        data: {
            replyCode,
            repliedAt: new Date(),
            status: 'delivered',
        },
        })

        results.push({
        focalPoint: notification.focalPoint.name,
        phone: notification.focalPoint.phone,
        replyCode,
        })

        await new Promise(r => setTimeout(r, 50))
    }

    return results
}

export async function GET() {
    const [alerts, focalPoints] = await Promise.all([
        prisma.alert.findMany({
        where: { processed: true },
        select: { id: true, title: true, countryCode: true, severity: true },
        orderBy: { ingestedAt: 'desc' },
        take: 20,
        }),
        prisma.focalPoint.findMany({
        where: { active: true },
        select: { id: true, name: true, phone: true, countryCode: true },
        orderBy: { createdAt: 'desc' },
        }),
    ])

    return NextResponse.json({ alerts, focalPoints })
}