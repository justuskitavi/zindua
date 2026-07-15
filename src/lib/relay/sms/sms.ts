const AT_BASE = 'https://api.africastalking.com/version1'
const AT_SANDBOX_BASE = 'https://api.sandbox.africastalking.com/version1'

const isSandbox = process.env.AT_USERNAME === 'sandbox'
const BASE_URL = isSandbox ? AT_SANDBOX_BASE : AT_BASE

export interface SMSResult {
    phone : string,
    messageId : string | null,
    status: 'sent' | 'failed',
    error? : string
}

export async function sendSMS(phone : string, message : string) : Promise<SMSResult> {
    const APIKey = process.env.AT_API_KEY
    const username = process.env.AT_USERNAME
    const senderId = process.env.SENDER_ID

    if (!APIKey || !username) {
        console.error(`APIKey or username not set`)
        return { phone, messageId : null, status : 'failed', error : 'Missing credentials' }
    }

    const safeMessage = message.length < 160 ? message.slice(0, 157) + ('...') : message

    try {
        const body = new URLSearchParams({
            username,
            to : phone,
            message : safeMessage,
            ...(senderId ? { from : senderId }: {}),
        })

        const res = await fetch(`${BASE_URL}/messaging`,{
            method : 'POST',
            headers : {
                APIKey,
                Accept : 'application/json',
                Content_type : 'application//x-www-form-urlencoded',
            },
            body : body.toString(),
            signal : AbortSignal.timeout(15_000),
        })

        if (!res.ok) {
            const text = await res.text()
            console.error(`[sms] at HTTP ${res.status}: `, text)
            return { phone, messageId : null, status : 'failed', error : `HTTP : ${res.status}` }
        }

        const data = await res.json()
        const recipient = data?.SMSMessageData?.Recipients?.[0]

        if (!recipient) {
            console.error(`[smas] Unexpected AT response shape: `, data)
            return { phone, messageId : null, status : 'failed', error : 'Unexpected response'}
        }

        if (recipient.statusCode === 101){
            console.log(`Message sent to ${phone}, messageID : ${recipient.messageId}`)
            return { phone, messageId : String(recipient.messageId), status : 'sent' }
        }

        console.error(`[sms] AT delivery for ${phone} failed : `, recipient.status)
        return { phone, messageId : null, status : 'failed', error : recipient.status}
    }catch(err){
        console.error(`[sms] fetch error for ${phone} : `,err)
        return { phone, messageId : null, status : 'failed', error : err instanceof Error ? err.message : String(err) }
    }
}

export async function sendBulkSMS(recipents:Array<{ phone : string; message : string}>) : Promise<SMSResult[]> {
    const results : SMSResult[] = []

    for (const { phone, message} of recipents) {
        const result = await sendSMS(phone, message)
        results.push(result)

        await new Promise(r => setTimeout(r, 200))
    }
    
    return results    
}