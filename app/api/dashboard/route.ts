import { NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma/client'

export async function GET() {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 8);
    const [alerts, notifications, focalPoints] = await Promise.all([
      prisma.alert.findMany({
        where: { ingestedAt: { gte: sevenDaysAgo, lte: now, } },
        orderBy: { ingestedAt: 'desc' },
        take: 50,
        include: {
          translations: { select: { language: true } },
          notifications: {
            select: {
              status: true,
              replyCode: true,
              focalPoint: { select: { name: true, phone: true, countryCode: true } },
            },
          },
        },
      }),
      prisma.notifications.findMany({
        where: { replyCode: 3 },
        include: {
          alert: { select: { title: true, countryCode: true, severity: true } },
          focalPoint: { select: { name: true, phone: true } },
        },
        orderBy: { repliedAt: 'desc' },
        take: 20,
      }),
      prisma.focalPoint.count({ where: { active: true } }),
    ])

    const alertsWithStats = alerts.map(alert => {
      const total = alert.notifications.length
      const confirmed = alert.notifications.filter(n => n.replyCode === 1 || n.replyCode === 2).length
      const acting = alert.notifications.filter(n => n.replyCode === 2).length
      const needsHelp = alert.notifications.filter(n => n.replyCode === 3).length
      const sent = alert.notifications.filter(n => n.status === 'sent').length

      return {
        id: alert.id,
        title: alert.title,
        source: alert.source,
        hazardType: alert.hazardType,
        severity: alert.severity,
        countryCode: alert.countryCode,
        region: alert.region,
        issuedAt: alert.issuedAt,
        ingestedAt: alert.ingestedAt,
        processed: alert.processed,
        translationCount: alert.translations.length,
        stats: { total, sent, confirmed, acting, needsHelp },
      }
    })

    const totalAlerts = alertsWithStats.length
    const totalNotified = alertsWithStats.reduce((sum, a) => sum + a.stats.sent, 0)
    const totalConfirmed = alertsWithStats.reduce((sum, a) => sum + a.stats.confirmed, 0)
    const totalEscalations = notifications.length
    const confirmationRate = totalNotified > 0
      ? Math.round((totalConfirmed / totalNotified) * 100)
      : 0
    
    return NextResponse.json({
      metrics: {
        totalAlerts,
        totalNotified,
        confirmationRate,
        totalEscalations,
        activeFocalPoints: focalPoints,
      },
      alerts: alertsWithStats,
      escalations: notifications.map(n => ({
        id: n.id,
        focalPointName: n.focalPoint.name,
        focalPointPhone: n.focalPoint.phone,
        alertTitle: n.alert.title,
        alertCountry: n.alert.countryCode,
        alertSeverity: n.alert.severity,
        repliedAt: n.repliedAt,
      })),
    })
  } catch (err) {
    console.error('[dashboard api] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}