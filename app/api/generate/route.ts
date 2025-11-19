import { NextResponse } from "next/server";
import OpenAI from "openai";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import prisma from "@/lib/prisma";

// הגדרת OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// הגדרת Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// פונקציית עזר לרקורסיה על מבנה הקבצים
function parseStructure(folder: JSZip, structure: any) {
  for (const [key, value] of Object.entries(structure)) {
    if (typeof value === "string") {
      // אם הערך הוא מחרוזת -> צור קובץ עם התוכן
      folder.file(key, value);
    } else {
      // אם הערך הוא אובייקט -> צור תיקייה וכנס פנימה
      const newFolder = folder.folder(key);
      if (newFolder) parseStructure(newFolder, value);
    }
  }
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    const cleanPrompt = prompt.trim().toLowerCase(); 

    if (!cleanPrompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    // --- שלב 1: בדיקה ב-Cache ---
    const existingTemplate = await prisma.template.findUnique({
      where: { prompt: cleanPrompt },
    });

    if (existingTemplate) {
      console.log("⚡ Cache HIT! Returning existing URL.");
      // עדכון מונה הורדות
      await prisma.template.update({
        where: { id: existingTemplate.id },
        data: { downloads: { increment: 1 } },
      });
      return NextResponse.json({ url: existingTemplate.s3Url, cached: true });
    }

    // --- שלב 2: יצירה עם AI (החלק המשופר) ---
    console.log("🤖 Cache MISS. Asking OpenAI for professional boilerplate...");
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Senior Software Architect. 
          Your goal is to generate a **production-ready** project boilerplate structure based on the user's tech stack.

          RULES FOR OUTPUT JSON:
          1. Root key must be "project_root".
          2. **CRITICAL:** Files like "package.json", "tsconfig.json", "requirements.txt", "Dockerfile", ".gitignore" MUST be key-value pairs where the value is a **STRING** (the file content). DO NOT create nested objects for these files.
          3. For "package.json", ensure it is a valid stringified JSON.

          CONTENT GUIDELINES:
          1. Structure: Use standard folders (e.g., src/controllers, src/routes, src/models, src/utils, or app/ folder for Next.js).
          2. Content: Do NOT leave files empty. Write minimal runnable boilerplate code.
          3. Stubs: Include standard functions (e.g., "login", "createUser", "healthCheck") with implementations or helpful comments.
          4. Config: Include a proper Dockerfile and docker-compose.yml if requested.
          
          EXAMPLE JSON OUTPUT:
          {
            "project_root": {
              "package.json": "{\n  \"name\": \"my-app\",\n  \"dependencies\": { ... }\n}",
              "src": {
                "server.js": "const express = require('express')...",
                "controllers": {
                  "authController.js": "exports.login = (req, res) => { res.send('Login Logic'); }"
                }
              }
            }
          }
          `
        },
        { 
          role: "user", 
          content: `Create a rich boilerplate for: ${prompt}. 
          Ensure "package.json" is a single file string, not a folder. 
          Include proper folder structure and basic code implementation.` 
        }
      ],
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("AI returned empty content");

    const structure = JSON.parse(content);
    const rootKey = Object.keys(structure)[0]; // usually "project_root"

    // --- שלב 3: יצירת ZIP ---
    const zip = new JSZip();
    parseStructure(zip, structure[rootKey]);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // --- שלב 4: העלאה ל-Supabase Storage ---
    const fileName = `boilerplate-${Date.now()}.zip`;
    const { error: uploadError } = await supabase.storage
      .from("boilerplates")
      .upload(fileName, zipBuffer, { contentType: "application/zip" });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage
      .from("boilerplates")
      .getPublicUrl(fileName);

    // --- שלב 5: שמירה ב-DB ---
    await prisma.template.create({
      data: {
        prompt: cleanPrompt,
        s3Url: publicUrlData.publicUrl,
        downloads: 1
      }
    });

    console.log("✅ New rich template saved & cached!");
    return NextResponse.json({ url: publicUrlData.publicUrl, cached: false });

  } catch (error: any) {
    console.error("🔴 Error:", error);
    return NextResponse.json({ error: "Failed to generate project" }, { status: 500 });
  }
}