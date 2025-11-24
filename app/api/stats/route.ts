import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic'; // חובה כדי שלא ישמור cache סטטי

export async function GET() {
  try {
    const result = await prisma.template.aggregate({
      _sum: {
        downloads: true
      }
    });

    const count = result._sum.downloads || 0;
    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}