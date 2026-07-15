
//   npx tsx src/scripts/seedFocalPoints.ts

import { prisma } from '../lib/prisma/client'

// Replace these phone numbers with real numbers you can receive SMS on.
// Africa's Talking sandbox only delivers to numbers registered in your
// sandbox test accounts on https://account.africastalking.com/apps/sandbox/testers
const TEST_FOCAL_POINTS = [
  {
    name: 'Test Focal Point Kenya',
    phone: '+254700000001', // replace with your registered sandbox number
    countryCode: 'KE',
    language: 'sw',
  },
  {
    name: 'Test Focal Point Ethiopia',
    phone: '+251900000001', // replace with your registered sandbox number
    countryCode: 'ET',
    language: 'am',
  },
  {
    name: 'Test Focal Point Somalia',
    phone: '+252600000001', // replace with your registered sandbox number
    countryCode: 'SO',
    language: 'so',
  },
  {
    name: 'Test Focal Point South Sudan',
    phone: '+211900000001', // replace with your registered sandbox number
    countryCode: 'SS',
    language: 'en',
  },
  {
    name: 'Test Focal Point Uganda',
    phone: '+256700000001', // replace with your registered sandbox number
    countryCode: 'UG',
    language: 'en',
  },
]

async function main() {
  console.log(`Seeding ${TEST_FOCAL_POINTS.length} focal points...`)

  for (const fp of TEST_FOCAL_POINTS) {
    const result = await prisma.focalPoint.upsert({
      where: { phone: fp.phone },
      create: fp,
      update: { name: fp.name, countryCode: fp.countryCode, language: fp.language },
    })
    console.log(`✓ ${result.name} (${result.phone}) — ${result.countryCode}`)
  }

  console.log('\nDone. Focal points seeded.')
  console.log('\nIMPORTANT: Replace placeholder phone numbers with real numbers')
  console.log('registered in your Africa\'s Talking sandbox test accounts.')
  console.log('See: https://account.africastalking.com/apps/sandbox/testers')

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})