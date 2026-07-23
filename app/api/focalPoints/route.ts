import { NextResponse } from "next/server";
import { prisma } from '@/src/lib/prisma/client'

export async function GET(){
    try{
        const focalPoints = await prisma.focalPoint.findMany({
            orderBy: { createdAt : 'desc' },
            include: {
                _count: { select: { notifications : true } },
                notifications : {
                    select : { replyCode : true, status : true },
                    orderBy : { createdAt : 'desc' },
                    take: 1,
                }
            }
        })

        return NextResponse.json(focalPoints.map(fp => ({
            id : fp.id,
            name : fp.name,
            phone : fp.phone,
            countryCode : fp.countryCode,
            language : fp.language, 
            active : fp.active,
            createdAt : fp.createdAt,
            totalNotifications : fp._count.notifications,
            lastReplyCode : fp.notifications[0]?.replyCode ?? null,
            lastStatus : fp.notifications[0]?.status ?? null,
        })))
    }catch(err){
        console.error(`[focal-points GET]`, err)
        return NextResponse.json({ error : 'Failed to fetch focal points'}, { status : 500} )
    }
}

export async function POST(request : Request){
    try{
        const body = await request.json()
        const { name, phone, countryCode, language } = body

        if (!name || !phone || !countryCode || !language){
            console.error(`Name, phone, country code and language are required`)
            return NextResponse.json({ error : `Name, phone, country code and language are required` }, { status : 400 })
        }

        if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
            return NextResponse.json(
                { error: 'Phone must be in E.164 format e.g. +254712345678' },
                { status: 400 }
            )
        }

        const fp = await prisma.focalPoint.create({ data: { name, phone, countryCode, language, active : true }  })

        return NextResponse.json(fp, { status : 201})
    }catch(err: any){
        if (err?.code === 'P2002') {
            return NextResponse.json({ error : `Phone number already registered.`}, { status : 400})
        }

        console.error(`[focal-point POST]`, err)
        return NextResponse.json({ error: `Failed to create focal point.`}, { status : 500 })
    }
}