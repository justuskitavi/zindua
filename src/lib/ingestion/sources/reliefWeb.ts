import {
    type IngestionSource,
    type AlertHazard,
    type NormalizedAlert,
    IGADCcountries
} from "../normalize"

const RELIEFWEB_BASE = "https://api.reliefweb.int/v2"

const ISO3_TO_ISO2: Record<string, string> = {
    KEN:'KE', UGA: 'UG', ETH: 'ET', SOM: 'SO', SSD: 'SS', DJI: 'DJ', ERI: 'ER', SDN: 'SD',
}

const ISO2_TO_ISO3: Record<string, string> = Object.fromEntries(
    Object.entries(ISO3_TO_ISO2).map(([k, v]) => [v,k])
)

interface reliefWebReport {
    id: string,
    fields: {
        title: string,
        body?: string,
        date: { created: string },
        country?: Array<{iso3: string, name: string}>,
        disaster_type?:Array<{ name: string }>
        source?: Array<{ name: string }>
    }
}

function mapHazard(disasterTypes: Array<{ name: string }> | undefined): AlertHazard {
    if (!disasterTypes?.length) return "other"

    const name = disasterTypes[0].name.toLowerCase()

    if (name.includes('food')) return "food_insecurity"
    if (name.includes('drought')) return "drought"
    if (name.includes('flood')) return "flood"
    if (name.includes('heat') || name.includes('temperature')) return 'extreme_heat'
    return 'other'
}

function inferSeverity(title: string) {
    const t = title.toLowerCase()

    if (t.includes('emergency') || t.includes('crisis') || t.includes('famine')) return 'emergency'
    if (t.includes('warning') || t.includes('severe') || t.includes('major')) return 'warning'
    return 'watch'
}

export const reliefWeb: IngestionSource = {
    name: 'reliefweb',

    async fetchAndNormalize(): Promise<NormalizedAlert[]> {
        const igadIso3 = IGADCcountries.map(c => ISO2_TO_ISO3[c]).filter(Boolean)

        let reports: reliefWebReport[]

        try {
            const url = `${RELIEFWEB_BASE}/reports?appname=test`
            const res = await fetch(
                url, {
                        
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        filter: {
                            operator: 'AND',
                            conditions: [
                                { field: 'type.name', value: 'Alert' },
                                {
                                    operator: 'OR',
                                    conditions: igadIso3.map(code => ({
                                        field: 'country.iso3',
                                        value: code,
                                    })),
                                },
                            ]
                        },

                        fields: {
                            include: ['title', 'body', 'date', 'country', 'disaster_type','source'],
                        },
                        sort: [{ field: 'date', order: 'desc' }],
                        limit: 20,
                    }),
                    signal: AbortSignal.timeout(10_000),
                }
            )
            if (!res.ok) {
                const errorText = await res.text()
                console.error(`[reliefweb] HTTP ${res.status}`, errorText)
                return []
            }


            const json = await res.json()
            reports = json.data ?? []
        }catch(err) {
            console.error(`[reliefweb]  fetch failed:`, err)
            return []
        }

        const results: NormalizedAlert[] = []

        for(const report of reports) {

            const f = report.fields

            const countries = f.country ?? []

            for (const country of countries) {
                const iso2 = ISO3_TO_ISO2[country.iso3]

                if (!iso2) continue

                results.push({
                    source: 'reliefweb',
                    externalId: `${report.id}-${iso2}`,
                    title: f.title,
                    rawContent: f.body ?? f.title,
                    hazardType: mapHazard(f.disaster_type),
                    severity: inferSeverity(f.title),
                    countryCode: iso2,
                    region: null,
                    issuedAt: new Date(f.date.created)
                })                    
            }
        }

        return results
    },

}