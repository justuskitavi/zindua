import {
    type IngestionSource,
    type NormalizedAlert,
    type AlertHazard,
    ipcPhaseToSeverity,
    IGADCcountries
} from "../normalize"
import { getFEWSAuthToken } from "@/src/scripts/auth"

const FEWS_NET_BASE = "https://fdw.fews.net/api"

interface fewsNetAlert {
    id: number,
    title: string,
    summary: string,
    country: string,
    region_name?: string,
    ipc_phase?: number,
    hazard_category?: string,
    published_date: string
}

function mapHazard(category: string | undefined): AlertHazard {

    if(!category) return'food_insecurity' //default

    const c = category.toLowerCase()
    if (c.includes('flood')) return 'flood'
    if (c.includes('drought')) return 'drought'
    if (c.includes('food') || c.includes('famine')) return 'food_insecurity'
    if (c.includes('conflict') || c.includes('displace')) return 'displacement'
    if (c.includes('disease') || c.includes('health')) return 'disease'
    return 'other'
}

export const fewsNet: IngestionSource = {
    name: 'fewsnet',

    async fetchAndNormalize(): Promise<NormalizedAlert[]> {
        const results: NormalizedAlert[] = []
        const authToken = getFEWSAuthToken()
        for (const country of IGADCcountries) {
            let data: fewsNetAlert[]

            try {
                
                const url = `${FEWS_NET_BASE}/geograhicunit/?country=${country}&format=json&limit=10`
                const res = await fetch (
                    url,{
                        headers: { Accept: 'application/json',
                            ...(authToken ? { Authorization: `JWT: ${authToken}` }: {}),
                         },
                        signal: AbortSignal.timeout(10_000),
                    }) 
                    
                if (!res.ok) {
                    console.error(`[fewsnet] HTTP ${res.status} for country ${country}`)
                    continue
                }

                const json = await res.json()
                data = Array.isArray(json)
                    ? json
                    : Array.isArray(json.results)
                        ? json.results                        
                        : []
            } catch(err) {
                console.error(`[fewsnet] failed for country ${country}`, err)
                continue
            }

            for (const  alert of data ) {
                results.push ({
                    source: 'fewsnet',
                    externalId: String(alert.id),
                    title: alert.title,
                    rawContent: alert.summary,
                    hazardType: mapHazard(alert.hazard_category),
                    severity: ipcPhaseToSeverity(alert.ipc_phase ?? 2),
                    countryCode: country,
                    region: alert.region_name ?? null,
                    issuedAt: new Date(alert.published_date),
                })
            } 
        }
        return results
    },
}
