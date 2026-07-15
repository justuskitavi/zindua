// Test script for the translation layer.
// Run after ingestion has saved at least one alert to the database.
//
// Usage:
//   npx tsx src/scripts/testTranslation.ts
//
// What it does:
//   1. Finds the most recently ingested unprocessed alert
//   2. Sends it to Claude for translation
//   3. Prints all five language versions
//   4. Confirms the row was saved to the translations table

import { prisma } from '../lib/prisma/client'
import { translateAlert } from '../lib/translation/translation'

async function main() {
  // Find the most recent unprocessed alert to test with
  const alert = await prisma.alert.findFirst({
    where: { processed: false },
    orderBy: { ingestedAt: 'desc' },
  })

  if (!alert) {
    console.log('No unprocessed alerts found. Run the ingestion test first:')
    console.log('  npx tsx src/scripts/testIngestion.ts')
    process.exit(0)
  }

  console.log('\n--- Alert to translate ---')
  console.log(`ID:       ${alert.id}`)
  console.log(`Title:    ${alert.title}`)
  console.log(`Source:   ${alert.source}`)
  console.log(`Hazard:   ${alert.hazardType}`)
  console.log(`Severity: ${alert.severity}`)
  console.log(`Country:  ${alert.countryCode}`)
  console.log(`Content:  ${alert.rawContent}`)

  console.log('\n--- Calling Claude ---')
  const start = Date.now()
  const success = await translateAlert(alert.id)
  const duration = Date.now() - start

  if (!success) {
    console.error('Translation failed. Check your ANTHROPIC_API_KEY.')
    process.exit(1)
  }

  console.log(`\n✓ Translation complete in ${duration}ms`)

  // Fetch and display the saved translations
  const translations = await prisma.translation.findMany({
    where: { alertId: alert.id },
    orderBy: { language: 'asc' },
  })

  console.log('\n--- Translations ---')
  for (const t of translations) {
    console.log(`\n[${t.language.toUpperCase()}]`)
    console.log(`SMS  (${t.smsContent.length} chars): ${t.smsContent}`)
  }

  // Check SMS length constraint
  const tooLong = translations.filter(t => t.smsContent.length > 160)
  if (tooLong.length > 0) {
    console.warn('\n⚠ These SMS versions exceed 160 characters:')
    tooLong.forEach(t => console.warn(`  [${t.language}]: ${t.smsContent.length} chars`))
  } else {
    console.log('\n✓ All SMS versions within 160 character limit')
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})