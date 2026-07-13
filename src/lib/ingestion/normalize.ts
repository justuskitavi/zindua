export type AlertSeverity = 'watch' | 'warning' | 'emergency'

export type AlertHazard = 'flood' | 'drought' | 'food_insecurity' | 'extreme_heat' | 'displacement' | 'disease' | 'wildfire' | 'other'

export type AlertSource = 'gdacs' | 'openmeteo'

export interface NormalizedAlert {
    source: AlertSource,
    externalId: string,
    title: string,
    rawContent: string,
    hazardType: AlertHazard,
    severity: AlertSeverity,
    countryCode: string,
    region: string | null,
    issuedAt: Date
}

export interface IngestionSource {
    name: AlertSource,
    fetchAndNormalize(): Promise<NormalizedAlert[]>
}

export function precipToSeverity(mmPerDay: number): AlertSeverity {
    if (mmPerDay >= 100) return "emergency"
    if (mmPerDay === 60) return "warning"
    return "watch"
}

export function tempToSeverity(Degrees: number): AlertSeverity {
    if (Degrees >= 43) return "warning"
    return "watch"
}

export const IGADCcountries = ['KE', 'ET', 'SO', 'SS', 'UG', 'DJ', 'ER', 'SD'] as const 
export type IgadCountry = typeof IGADCcountries[number]