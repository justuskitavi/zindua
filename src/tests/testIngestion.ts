import { openMeteo } from "../lib/ingestion/sources/openMeteo";
import { gdacs } from "../lib/ingestion/sources/gdacs";

async function main() {
    const sources = [gdacs, openMeteo]

    for (const  source of sources) {
        console.log(`\n ---Testing source ${source.name}---`)

        try {
            const alerts = await source.fetchAndNormalize()
            console.log(`Fetched ${alerts.length} alerts.`)
            
            if (alerts.length > 0) {
                console.log(`Sample alert: \n`)
                console.dir(alerts[0], { depth: null })
            }
        }catch(err) {
            console.error(`Failed: `, err)
        }
    }
}

main()