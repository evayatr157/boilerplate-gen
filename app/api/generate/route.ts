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
    // 1. זיהוי המשתמש (חובה await בגרסאות חדשות)
    const { userId } = await auth();
    
    const { prompt } = await req.json();
    const cleanPrompt = prompt.trim().toLowerCase(); 

    if (!cleanPrompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    // --- שלב 1: חיפוש גלובלי ב-Cache ---
    // בודקים אם *מישהו* כבר יצר פרויקט כזה, כדי לחסוך זמן וכסף
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
      
      // אם המשתמש מחובר, שומרים לו את הפרויקט בהיסטוריה האישית
      // אבל משתמשים בלינק הקיים (בלי לשלם שוב ל-AI)
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

      // עדכון מונה הורדות כללי
      await prisma.template.update({
        where: { id: globalTemplate.id },
        data: { downloads: { increment: 1 } },
      });

      return NextResponse.json({ url: globalTemplate.s3Url, cached: true });
    }

    // --- תרחיש ב': יצירה חדשה (AI) ---
    console.log("🤖 Cache MISS. Asking OpenAI (GPT-4o)...");
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Senior DevOps Architect. Generate a **Production-Ready, Interactive Starter Kit**.
          
          ### GOAL: 
          Zero-friction developer experience. The user downloads, runs ONE setup command, and starts coding immediately.

          ### REQUIRED OUTPUT (JSON):
          1. Root key: "project_root".
          2. All files must be string values (no nested objects for file content).
          
          ### MANDATORY CONTENTS & SAFETY RULES:
          1. **Project Structure:** Professional folder hierarchy tailored to the language.
          
          2. **DEPENDENCY ENFORCEMENT (CRITICAL):**
             - **RULE:** If you write 'import ... from "X"', then "X" MUST be in package.json.
             - **MANDATORY FOR NODE/TS:** You MUST include 'dotenv', '@types/node', and 'ts-node' in package.json devDependencies/dependencies.
             - **EXCEPTION:** Do NOT add '@types/mongoose' (it is built-in since version 8). Adding it causes install errors.

          3. **Build Safety (CRITICAL):**
             - **tsconfig.json:** You MUST set "skipLibCheck": true, "noImplicitAny": false, "esModuleInterop": true.
             - **Dockerfile:** - Use 'node:18-alpine' (or newer).
                - Ensure 'npm install' runs before 'npm run build'.
                - Ensure the 'build' script exists in package.json.

          ### THE "ZERO CONFIG" LOGIC:
          1. **Analyze Requirements:** Determine exactly which env vars are needed (e.g., MONGO_URI).
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
          Ensure dependencies are consistent and the setup script is interactive.` 
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

    const fileName = `boilerplate-${crypto.randomUUID()}.zip`;
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

    console.log("✅ New robust template saved!");
    return NextResponse.json({ url: publicUrlData.publicUrl, cached: false });

  } catch (error: any) {
    console.error("🔴 Error:", error);
    return NextResponse.json({ error: "Failed to generate project" }, { status: 500 });
  }
}