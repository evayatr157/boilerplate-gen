import { NextResponse } from "next/server";
import OpenAI from "openai";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// הגדרת OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// הגדרת Supabase Storage
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// פונקציית עזר ליצירת ה-ZIP
function parseStructure(folder: JSZip, structure: any) {
  for (const [key, value] of Object.entries(structure)) {
    if (typeof value === "string") {
      folder.file(key, value);
    } else {
      const newFolder = folder.folder(key);
      if (newFolder) parseStructure(newFolder, value);
    }
  }
}

export async function POST(req: Request) {
  try {
    // 1. זיהוי המשתמש
    const { userId } = await auth();
    
    const { prompt } = await req.json();
    const cleanPrompt = prompt.trim().toLowerCase(); 

    if (!cleanPrompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    // --- שלב 1: חיפוש גלובלי ב-Cache ---
    const globalTemplate = await prisma.template.findFirst({
      where: { 
        prompt: cleanPrompt,
        s3Url: { not: "" } 
      },
      orderBy: { createdAt: 'desc' }
    });

    // --- תרחיש א': נמצא ב-Cache (Cache HIT) ---
    if (globalTemplate) {
      console.log("⚡ Cache HIT! Serving existing URL...");
      
      if (userId) {
        await prisma.template.create({
          data: {
            prompt: cleanPrompt,
            s3Url: globalTemplate.s3Url,
            downloads: 1,
            userId: userId 
          }
        });
      }

      await prisma.template.update({
        where: { id: globalTemplate.id },
        data: { downloads: { increment: 1 } },
      });

      return NextResponse.json({ url: globalTemplate.s3Url, cached: true });
    }

    // --- תרחיש ב': יצירה חדשה (AI) - כאן השינוי! ---
    console.log("🤖 Cache MISS. Asking OpenAI (New Model)...");
    
    const completion = await openai.chat.completions.create({
      // שינוי 1: המודל החדש והזול
      model: "gpt-5.1-codex-mini", 
      
      // שינוי 2: ביטול חשיבה עמוקה לטובת מהירות
      // @ts-ignore (במקרה שה-SDK עדיין לא עודכן לטיפוס הזה)
      reasoning_effort: "none",

      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Senior DevOps Architect. Generate a **Production-Ready, Interactive Starter Kit**.
          
          ### GOAL: 
          Zero-friction developer experience. The user downloads, runs ONE setup command, and starts coding.

          ### REQUIRED OUTPUT (JSON):
          1. Root key: "project_root".
          2. All files must be string values (no nested objects for file content).
          
          ### MANDATORY CONTENTS:
          1. **Project Structure:** Professional folder hierarchy (src/controllers, src/config, etc).
          2. **Dependencies:** Valid 'package.json' with all needed libraries.
          
          ### THE "ZERO CONFIG" LOGIC (CRITICAL):
          1. **Analyze Requirements:** Determine exactly which env vars are needed (e.g., if MongoDB -> need MONGO_URI).
          2. **.env.example:** Create this file listing all keys with empty values.
          3. **scripts/setup.js:** Create a Node.js script (using native 'readline' & 'fs') that:
             - Welcomes the user.
             - **Iterates through every key** in .env.example.
             - **Asks the user** for the value, providing a HINT (e.g., "Enter MONGO_URI (Get it from MongoDB Atlas):").
             - Writes the results to a new '.env' file.
             - Prints: "✅ Setup complete! Run 'npm run dev' to start."
          4. **package.json scripts:** Add a "setup" script: "node scripts/setup.js".

          ### README.md Requirements:
          - **Quick Start Section:**
            1. \`npm install\`
            2. \`npm run setup\` (Interactive configuration)
            3. \`npm run dev\`
          
          ### EXAMPLE JSON STRUCTURE:
          {
            "project_root": {
              "package.json": "{ \"scripts\": { \"setup\": \"node scripts/setup.js\" } ... }",
              "scripts": {
                "setup.js": "const fs = require('fs'); ..."
              },
              "README.md": "# My Project\n\n## Quick Start\n...",
              "src": { ... }
            }
          }
          `
        },
        { 
          role: "user", 
          content: `Generate a starter kit for: ${prompt}.
          Ensure the setup script is interactive and helpful.` 
        }
      ],
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("AI returned empty content");

    const structure = JSON.parse(content);
    const rootKey = Object.keys(structure)[0];

    // --- שלב 3: יצירת ZIP והעלאה ---
    const zip = new JSZip();
    parseStructure(zip, structure[rootKey]);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const fileName = `boilerplate-${crypto.randomUUID()}.zip`; // שדרוג אבטחה קטן: UUID במקום Date
    const { error: uploadError } = await supabase.storage
      .from("boilerplates")
      .upload(fileName, zipBuffer, { contentType: "application/zip" });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage
      .from("boilerplates")
      .getPublicUrl(fileName);

    // --- שלב 4: שמירה ב-DB ---
    await prisma.template.create({
      data: {
        prompt: cleanPrompt,
        s3Url: publicUrlData.publicUrl,
        downloads: 1,
        userId: userId || null 
      }
    });

    console.log("✅ New template saved (Cheap & Fast)!");
    return NextResponse.json({ url: publicUrlData.publicUrl, cached: false });

  } catch (error: any) {
    console.error("🔴 Error:", error);
    return NextResponse.json({ error: "Failed to generate project" }, { status: 500 });
  }
}