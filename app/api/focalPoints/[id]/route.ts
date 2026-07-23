import { NextResponse } from "next/server";
import { prisma } from '@/src/lib/prisma/client'

export async function PATCH(request : Request, { params } : { params : Promise<{ id : string}>}) {
    try{
        const { id } = await params
        const body = await request.json()
        const { name, phone, countryCode, language, active } = body

        if (phone &&  !/^\+[1-9]\d{7,14}$/.test(phone)){
            return NextResponse.json({error : `Phone must be in E.164 format`}, { status : 400})
        }

        const fp = await prisma.focalPoint.update({
            where : { id },
            data : { 
                ...(name !== undefined && { name }),
                ...(phone !== undefined && { phone }),
                ...(countryCode !== undefined && { countryCode }),
                ...(language !== undefined && { language }),
                ...(active !== undefined && { active }),
            }
        })

        return NextResponse.json(fp, { status : 200 })
    }catch(err : any){
        if (err?.code === 'P2025') {
            return NextResponse.json({ error : `Focal point not found.`}, { status : 404})
        }
        
        if (err?.code === 'P2002') {
            return NextResponse.json({ error : `Phone number already registered.`}, { status : 409})
        }

        console.error(`[Focal-point PATCH]`, err)
    }
}

export async function DELETE(request : Request, { params } : { params : Promise<{ id : string }>}){
    try{
        const { id } = await params
        await prisma.focalPoint.delete({ where : { id } })
        return NextResponse.json({ ok : true })
    }catch(err : any){
        if (err?.code === 'P2025') {
        return NextResponse.json({ error: 'Focal point not found' }, { status: 404 })
    }
        console.error('[focal-points DELETE]', err)
        return NextResponse.json({ error: 'Failed to delete focal point' }, { status: 500 })
    } 
}