import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic'; // חובה כדי שלא ישמור cache סטטי

export async function GET() {
  try {
    // השינוי: במקום לסכום את downloads, אנחנו סופרים כמה שורות יש בטבלה
    const count = await prisma.template.count();

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}