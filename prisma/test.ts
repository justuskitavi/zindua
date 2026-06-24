import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
    const  result = await prisma.$queryRaw`SELECT NOW()`

    console.log("Successfully connected to Neon. We in  business baby!!")
    console.log(result)
}

main()
.catch((error) => {
    console.error("Unable to connect to Neon.")
    console.error(error)
})
.finally(async () => {
    await prisma.$disconnect()
})