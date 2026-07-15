// Test script for the relay engine.
// Tests the full flow: finds a translated alert, matches focal points,
// dispatches SMS via Africa's Talking sandbox.
//
// Prerequisites:
//   1. npx tsx src/scripts/testIngestion.ts   — save alerts to DB
//   2. npx tsx src/scripts/testTranslation.ts — translate alerts
//   3. npx tsx src/scripts/seedFocalPoints.ts — seed focal points
//   4. Set AT_API_KEY, AT_USERNAME=sandbox in .env.local
//
// Usage:
//   npx tsx src/scripts/testRelay.ts

import { prisma } from '../lib/prisma/client'
import { relayAlert } from '../lib/relay/relay'

async function main() {
  // Find a translated alert ready for relay
  const alert = await prisma.alert.findFirst({
    where: {
      processed: true,
      translations: { some: {} },
      notifications: { none: {} },
    },
    include: { translations: true },
    orderBy: { ingestedAt: 'desc' },
  })

  if (!alert) {
    console.log('No translated alerts ready for relay.')
    console.log('Run testTranslation.ts first.')
    process.exit(0)
  }

  console.log('\n--- Alert to relay ---')
  console.log(`ID:       ${alert.id}`)
  console.log(`Title:    ${alert.title}`)
  console.log(`Country:  ${alert.countryCode}`)
  console.log(`Translations available: ${alert.translations.map(t => t.language).join(', ')}`)

  // Check focal points exist for this country
  const focalPoints = await prisma.focalPoint.findMany({
    where: { countryCode: alert.countryCode, active: true },
  })

  if (focalPoints.length === 0) {
    console.log(`\nNo focal points for country ${alert.countryCode}.`)
    console.log('Run seedFocalPoints.ts first.')
    process.exit(0)
  }

  console.log(`\nFocal points matched: ${focalPoints.length}`)
  focalPoints.forEach(fp =>
    console.log(`  - ${fp.name} (${fp.phone}) [${fp.language}]`)
  )

  console.log('\n--- Dispatching SMS via Africa\'s Talking ---')
  const start = Date.now()
  const result = await relayAlert(alert.id)
  const duration = Date.now() - start

  console.log(`\n✓ Relay complete in ${duration}ms`)
  console.log(`  Matched:  ${result.focalPointsMatched}`)
  console.log(`  Sent:     ${result.sent}`)
  console.log(`  Failed:   ${result.failed}`)

  // Show notification records created
  const notifications = await prisma.notifications.findMany({
    where: { alertId: alert.id },
    include: { focalPoint: true },
  })

  console.log('\n--- Notification records ---')
  for (const n of notifications) {
    console.log(`  ${n.focalPoint.name}: ${n.status} (messageId: ${n.messageId ?? 'none'})`)
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})