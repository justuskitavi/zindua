import {
    type IngestionSource,
    type AlertHazard,
    type AlertSeverity,
    IGADCcountries,
    NormalizedAlert,
} from '../normalize'

const IGAD_WKT = 'POLYGON((22 -5,52 -5,52 22,22 22,22 -5))'

const GDACS_BASE = 'https://www.gdacs.org/gdacsapi'

const RELEVANT_EVENT_TYPES = new Set(['FL', 'DR', 'TC', 'WF', 'EQ'])

interface GdacsAffectedCountry {
    iso2: string
    iso3: string
    countryname: string
}

interface GdacsFeature {
    type : 'Feature',
    geometry: {
        type : string,
        coordinates : [number, number] 
    }
    properties: {
        eventtype: string
        eventid: number
        episodeid: number
        eventname: string
        name: string
        description: string
        htmldescription: string
        alertlevel: 'Green' | 'Orange' | 'Red'
        iscurrent: string           // "true" | "false" as strings
        country: string             // e.g. "Ethiopia, Kenya, Somalia"
        fromdate: string            // ISO date string
        todate: string
        datemodified: string
        iso3: string                // primary country ISO3
        affectedcountries: GdacsAffectedCountry[]
        severitydata: {
        severity: number
        severitytext: string
        severityunit: string
        }
    }
}

interface GdacsResponse {
    type : 'FeatureCollection',
    features : GdacsFeature[]
}

function mapHazard(eventType : string): AlertHazard {
    switch(eventType) {
        case 'FL' : return 'flood'
        case 'DR' : return 'drought'
        case 'WC' : return 'wildfire'
        case 'TC' : return 'displacement'
        case 'EQ' : return 'other'
        default : return 'other'
    }
}


function mapSeverity(alertColour : string) : AlertSeverity {
    switch(alertColour) {
        case 'Red' : return 'emergency'
        case 'Orange' : return 'warning'
        default : return 'watch'
    }
}

function buildRawContent(props : GdacsFeature['properties']) : string {
    const parts = [props.name]

    if (props.severitydata?.severitytext){
        parts.push(props.severitydata.severitytext)
    }

    if (props.fromdate && props.todate) {
        const from = new Date(props.fromdate).toDateString()
        const to = new Date(props.todate).toDateString()

        parts.push(`Active period: ${from} to ${to}`)
    }

    if (props.country) {
        parts.push(`Affected area: ${props.country}`)
    }

    return parts.join(', ') + '.'
} 

export const gdacs : IngestionSource = {
    name : 'gdacs',

    async fetchAndNormalize(): Promise<NormalizedAlert[]> {
        let data: GdacsResponse | null = null

        try {
            const params = new URLSearchParams({
                geometryArea : IGAD_WKT,
                lastdays : '7',
            })
            
            const res = await fetch(
                `${GDACS_BASE}/api/Events/geteventlist/eventsbyarea?${params}`,
                {
                    headers : { Accept : 'application/json' },
                    signal : AbortSignal.timeout(15_000)
                }                
            )

            if (!res.ok){
                const text = await res.text()
                console.error(`[gdacs] http ${res.status}: `, text)
                return []
            }

            data = await res.json() as GdacsResponse
        } catch (err) {
            console.error(`[gdacs] fetch failed: `, err)
            return []
        }

        const features = Array.isArray(data?.features) ? data.features : []

        if (features.length === 0) {
            console.log(`[gdacs] no features fetched.`)
            return []
        }

        const results : NormalizedAlert[] = []

        for (const feature of features) {
            const props = feature.properties

            if (!RELEVANT_EVENT_TYPES.has(props.eventtype)) continue

            if (props.iscurrent !== 'true') continue

            const igadCountries = props.affectedcountries.length > 0
            ? props.affectedcountries.filter((c: GdacsAffectedCountry) => IGADCcountries.includes(c.iso2 as (typeof IGADCcountries)[number]))
            : []

            if (igadCountries.length === 0) {
                const primaryIso2 = ISO3_TO_ISO2[props.iso3]

                if (primaryIso2 && IGADCcountries.includes(primaryIso2 as (typeof IGADCcountries)[number])){
                    igadCountries.push({
                        iso2 : primaryIso2,
                        iso3 : props.iso3,
                        countryname : props.country
                    })
                } else {
                    continue
                }                
            }
            const rawContent = buildRawContent(props)
            const hazardType = mapHazard(props.eventtype)
            const severity = mapSeverity(props.alertlevel)
            const issuedAt = new Date(props.fromdate)
            const title = props.name || props.eventname || props.eventtype
            
            for (const country of igadCountries) {
                results.push({
                    source : 'gdacs',
                    externalId : `${props.eventtype}-${props.eventid}-${props.episodeid}-${country.iso2}`,
                    title,
                    rawContent,
                    hazardType,
                    severity,
                    countryCode : country.iso2,
                    region: country.countryname,
                    issuedAt,
                })
            }
        
        }
        console.log(`[gdacs] normalized ${results.length} alerts from ${features.length} features`)
    return results
    },
}

const ISO3_TO_ISO2: Record<string, string> = {
  KEN: 'KE',
  ETH: 'ET',
  SOM: 'SO',
  SSD: 'SS',
  UGA: 'UG',
  DJI: 'DJ',
  ERI: 'ER',
  SDN: 'SD',
}
 