import { GoogleGenAI } from '@google/genai'
import { translate } from '@vitalets/google-translate-api'
import { prisma } from '../prisma/client'
import { requireEnv } from '@/src/utils/helpers'

const key = requireEnv('GEMINI_API_KEY')


const genai = new GoogleGenAI({ apiKey : key})

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'sw', name: 'Swahili' },
  { code: 'so', name: 'Somali' },
  { code: 'am', name: 'Amharic' },
  { code: 'om', name: 'Oromo' },
] as const

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code']

const GT_LANG_CODES: Record<string, string> = {
  sw: 'sw',
  so: 'so',
  am: 'am',
  om: 'om',
}

interface GeminiOutput {
  sms : string,
  full : string
}

const SEVERITY_LABELS: Record<string, Record<string, string>> = {
  watch:     { en: 'WATCH',   sw: 'TAARIFA',  so: 'DIGNIIN',  am: 'ማስጠንቀቂያ', om: 'BEEKSISA' },
  warning:   { en: 'WARNING', sw: 'TAHADHARI', so: 'OGEYSIIS', am: 'ጥንቃቄ',     om: 'EEGGANNOO' },
  emergency: { en: 'DANGER',  sw: 'HATARI',    so: 'KHATAR',   am: 'አደጋ',      om: 'BALAA' },
}

const REPLY_INSTRUCTIONS: Record<string, string> = {
  en: 'Reply: 1=Got it 2=Acting 3=Need help',
  sw: 'Jibu: 1=Nimeona 2=Ninaenda 3=Nahitaji msaada',
  so: 'Jawaab: 1=Helay 2=Wax qabanaya 3=Caawimo',
  am: 'መልስ: 1=ደረሰኝ 2=እያደረኩ 3=እርዳታ',
  om: 'Deebii: 1=Argadhe 2=Hojjedha 3=Gargaarsa',
}

async function rewriteWithGemini(alert: {
  title: string
  rawContent: string
  hazardType: string
  severity: string
  countryCode: string
  region: string | null
}): Promise<GeminiOutput | null> {
  const severityWord = SEVERITY_LABELS[alert.severity]?.en ?? 'ALERT'
  const prompt =  `You are an early warning communication specialist for East Africa.
Rewrite this disaster alert into plain, spoken English for a community leader.

ALERT DETAILS:
- Title: ${alert.title}
- Content: ${alert.rawContent}
- Hazard type: ${alert.hazardType}
- Severity: ${alert.severity.toUpperCase()}
- Country: ${alert.countryCode}
- Region: ${alert.region ?? 'nationwide'}

PRODUCE TWO VERSIONS:
 
1. SMS version:
- Start with "${severityWord} —"
- Maximum 120 characters total (count carefully)
- One specific action the person must take RIGHT NOW
- Plain spoken language, no jargon
 
2. Full version:
- 2-3 sentences
- Same plain language and urgency
- More detail on what to do and why
 
RULES:
- Never exceed 160 characters in the SMS version
- Always include a concrete physical action
- Write as if speaking to a village elder
 
Respond ONLY with valid JSON, no markdown, no backticks:
{"sms": "...", "full": "..."}`

try{
  const result  = await genai.models.generateContent({ model : 'gemini-3.5-flash', contents : prompt })
  const text = result.text ?? ''
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(clean) as GeminiOutput
  
  if (parsed.sms.length > 160) {
    console.warn(`Parsed sms content is ${parsed.sms.length} characters, truncating to 160 characters.`)
    parsed.sms = parsed.sms.slice(0,157) + '...'
  }
  
  return parsed
}catch(err){
  console.error(`[translate] Failed to translate alert`, err)
  return null
}
}

async function translateToLang(text : string, targetLang : string): Promise<string | null> {
  try{
    const result = await translate(text, {to : targetLang})
    console.log(text, targetLang)
    return result.text
  }catch (err : any){
    if (err?.statusCode === 429) {
      console.warn(`[translate] rate limited for ${targetLang}, using English fallback`)
    }
    else{
      console.error(`[translate] Google translate error for ${targetLang}`)
    }

    return null
  }
}

async function translateToAllLangs(engSms:string, engFull : string): Promise<Record<string, { sms : string; full : string}>> {

  const results : Record<string, { sms : string; full : string}> = { en : { sms : engSms, full : engFull } }
  
  const otherLanguages = SUPPORTED_LANGUAGES.filter(l => l.code !== 'en')

  for (const lang of otherLanguages){
    const gtCode = GT_LANG_CODES[lang.code]
    const [translatedSms, translatedFull] = await Promise.all([translateToLang(engSms, gtCode), translateToLang(engFull, gtCode)])

    results[lang.code] = {
      sms : translatedSms??engSms,
      full : translatedFull??engFull
    }
    await new Promise(r => setTimeout(r, 300))
  }

  return results
}

function assembleFinalSms(translatedSms : string, language : string, severity : string) {
  let sms = translatedSms

  const engSeverity = SEVERITY_LABELS[severity]?.en
  const localSeverity = SEVERITY_LABELS[severity]?.[language]

  if (engSeverity && localSeverity && sms.startsWith(engSeverity)){
    sms = sms.replace(engSeverity, localSeverity)
  }

  const replyLine = REPLY_INSTRUCTIONS[language] ?? REPLY_INSTRUCTIONS['en']
  const maxSmsLength = 160 - replyLine.length - 1
  const truncatedSms = sms.length > maxSmsLength ? sms.slice(0,maxSmsLength - 3) + '...' : sms

  return `${truncatedSms}\n${replyLine}`
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

  console.log(`[translate] rewriting alert ${alertId} with Gemini...`)


  const englishVersions = await rewriteWithGemini({
    title: alert.title,
    rawContent: alert.rawContent,
    hazardType: alert.hazardType,
    severity: alert.severity,
    countryCode: alert.countryCode,
    region: alert.region,
  })

  if (!englishVersions){
    console.error(`[translate] gemini failed for alert ${alert.id}`)
    return false
  }

  console.log(`[translate] English SMS (${englishVersions.sms.length} chars): ${englishVersions.sms}`)
  console.log(`[translate] translating into 4 languages...`)

  const allTranslations = await translateToAllLangs(englishVersions.sms, englishVersions.full)
  
  try {
        await prisma.$transaction(
      SUPPORTED_LANGUAGES.map(lang =>
        prisma.translation.upsert({
          where: { alertId_language: { alertId: alert.id, language: lang.code, },
          },
          create: { alertId: alert.id, 
            language: lang.code, 
            smsContent: assembleFinalSms(allTranslations[lang.code].sms, lang.code, alert.severity), 
            fullContent: allTranslations[lang.code].full
          },
          update: {
            smsContent: assembleFinalSms(allTranslations[lang.code].sms, lang.code, alert.severity), 
            fullContent: allTranslations[lang.code].full
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