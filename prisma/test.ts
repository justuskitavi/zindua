import "dotenv/config"
import { prisma } from "@/src/lib/prisma/client"

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