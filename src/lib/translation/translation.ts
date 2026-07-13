import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../prisma/client'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})


export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'sw', name: 'Swahili' },
  { code: 'so', name: 'Somali' },
  { code: 'am', name: 'Amharic' },
  { code: 'om', name: 'Oromo' },
] as const

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code']

interface TranslationOutput {
  en: { sms: string; }
  sw: { sms: string; }
  so: { sms: string; }
  am: { sms: string; }
  om: { sms: string; }
}


function buildPrompt(alert: {
  title: string
  rawContent: string
  hazardType: string
  severity: string
  countryCode: string
  region: string | null
}): string {
  const severityLabel = {
    watch: 'WATCH — potential hazard developing',
    warning: 'WARNING — hazard confirmed, prepare now',
    emergency: 'EMERGENCY — immediate action required',
  }[alert.severity] ?? alert.severity

  return `You are a disaster communication specialist for East Africa. 
Your job is to translate early warning alerts into clear, actionable messages for community focal points.

ALERT DETAILS:
- Title: ${alert.title}
- Content: ${alert.rawContent}
- Hazard type: ${alert.hazardType}
- Severity: ${severityLabel}
- Country: ${alert.countryCode}
- Region: ${alert.region ?? 'nationwide'}

TASK:
Produce translations in 5 languages: English, Swahili, Somali, Amharic, and Oromo.
The translation should have the following properties: Maximum 160 characters. Must include severity keyword and ONE specific recommended action. Written in plain spoken language, not bureaucratic. No technical jargon.

RULES:
- Never exceed 160 characters (count carefully)
- Always end the each translation with a concrete action: what should the person DO right now
- Use the local severity word for each language:
  - English: WATCH / WARNING / DANGER
  - Swahili: TAARIFA / TAHADHARI / HATARI
  - Somali: DIGNIIN / OGEYSIIS / KHATAR
  - Amharic: ማስጠንቀቂያ / ጥንቃቄ / አደጋ
  - Oromo: BEEKSISA / EEGGANNOO / BALAA
- Write as if speaking to a village elder or community leader
- Be specific about the hazard and location where possible

Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation. Exactly this structure:
{// Builds the prompt for Claude.
// The prompt is the most important piece of the translation layer —
// it defines the register, length constraints, and action requirement.
  "en": { "sms": "..." },
  "sw": { "sms": "..." },
  "so": { "sms": "..." },
  "am": { "sms": "..." },
  "om": { "sms": "..." }
}`
}


async function callClaude(prompt: string): Promise<TranslationOutput | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.error('[translate] no text block in Claude response')
      return null
    }

    const clean = textBlock.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    return JSON.parse(clean) as TranslationOutput
  } catch (err) {
    console.error('[translate] Claude API or parse error:', err)
    return null
  }
}


export async function translateAlert(alertId: string): Promise<boolean> {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { translations: true },
  })

  if (!alert) {
    console.error(`[translate] alert ${alertId} not found`)
    return false
  }

  if (alert.translations.length >= SUPPORTED_LANGUAGES.length) {
    console.log(`[translate] alert ${alertId} already translated, skipping`)
    return true
  }

  const prompt = buildPrompt({
    title: alert.title,
    rawContent: alert.rawContent,
    hazardType: alert.hazardType,
    severity: alert.severity,
    countryCode: alert.countryCode,
    region: alert.region,
  })

  const translations = await callClaude(prompt)

  if (!translations) {
    console.error(`[translate] failed to get translations for alert ${alertId}`)
    return false
  }

  
  try {
    await prisma.$transaction(
      SUPPORTED_LANGUAGES.map(lang =>
        prisma.translation.upsert({
          where: {
            alertId_language: {
              alertId: alert.id,
              language: lang.code,
            },
          },
          create: {
            alertId: alert.id,
            language: lang.code,
            smsContent: translations[lang.code].sms,
          },
          update: {
            smsContent: translations[lang.code].sms,
          },
        })
      )
    )

    await prisma.alert.update({
      where: { id: alert.id },
      data: { processed: true },
    })

    console.log(`[translate] ✓ translated alert ${alertId} into ${SUPPORTED_LANGUAGES.length} languages`)
    return true
  } catch (err) {
    console.error(`[translate] DB error saving translations for ${alertId}:`, err)
    return false
  }
}


export async function processUnprocessedAlerts(): Promise<{
  processed: number
  failed: number
  skipped: number
}> {
  const unprocessed = await prisma.alert.findMany({
    where: { processed: false },
    orderBy: { ingestedAt: 'asc' }, 
    take: 20, 
  })

  if (unprocessed.length === 0) {
    console.log('[translate] no unprocessed alerts found')
    return { processed: 0, failed: 0, skipped: 0 }
  }

  console.log(`[translate] processing ${unprocessed.length} unprocessed alerts`)

  let processed = 0
  let failed = 0
  let skipped = 0

  
  for (const alert of unprocessed) {
    const success = await translateAlert(alert.id)
    if (success) {
      processed++
    } else {
      failed++
    }
  }

  return { processed, failed, skipped }
}