import { NextResponse } from "next/server";
import OpenAI from "openai";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// --- הגדרות אבטחה ---
const MAX_DAILY_GENERATIONS = 5; // מקסימום פרויקטים ליום למשתמש
const MAX_PROMPT_LENGTH = 300;   // אורך מקסימלי לטקסט הבקשה

// --- 1. מילון החוקים החכם ---
const TECH_RULES: Record<string, string> = {
  "mongodb": `
    - **Mongoose 8+ Rules:** Do NOT use deprecated options like 'useNewUrlParser' or 'useUnifiedTopology' in mongoose.connect(). It causes TypeScript errors.
    - **Types:** Do NOT add '@types/mongoose' to package.json (it is built-in).`,
  
  "express": `
    - **Types:** You MUST include '@types/express' in devDependencies if using TypeScript.`,
  
  "node": `
    - **Env:** You MUST include 'dotenv' in dependencies.
    - **Types:** You MUST include '@types/node' in devDependencies.`,
  
  "typescript": `
    - **Config:** In 'tsconfig.json', set "skipLibCheck": true, "noImplicitAny": false, "esModuleInterop": true.`,
  
  "python": `
    - **Structure:** Put all python code inside 'src/' folder.
    - **Venv:** Instructions in README should mention creating a virtual environment.
    - **Files:** Include a standard .gitignore for Python (ignoring __pycache__, venv).`,
    
  "docker": `
    - **Build:** Ensure 'npm install' runs BEFORE 'npm run build' in the Dockerfile.
    - **Context:** Dockerfile COPY commands must match the 'src' folder structure.`,

  "prisma": `
    - **Python:** Use 'pip install prisma' (NOT prisma-client-py).
    - **Schema:** Ensure 'schema.prisma' is present.
    - **Generate:** Run 'prisma generate' after install.`
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { userId } = await auth();
    const { prompt } = await req.json();
    
    // --- Security Check 1: Input Validation ---
    if (!prompt || typeof prompt !== 'string') {
        return NextResponse.json({ error: "Invalid prompt format" }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
        return NextResponse.json({ error: "Prompt is too long (security limit)" }, { status: 400 });
    }

    // נרמול קלט למניעת כפילויות
    const cleanPrompt = prompt.trim().toLowerCase(); 

    // --- Security Check 2: Rate Limiting (רק למשתמשים רשומים) ---
    if (userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // תחילת היום

        const userUsageCount = await prisma.template.count({
            where: {
                userId: userId,
                createdAt: { gte: today } // כל מה שנוצר מהבוקר
            }
        });

        if (userUsageCount >= MAX_DAILY_GENERATIONS) {
            return NextResponse.json({ 
                error: "You reached the daily limit (5 projects). Come back tomorrow or upgrade!" 
            }, { status: 429 });
        }
    }

    // --- שלב 2: חיפוש ב-Cache ---
    const globalTemplate = await prisma.template.findFirst({
      where: { prompt: cleanPrompt, s3Url: { not: "" } },
      orderBy: { createdAt: 'desc' }
    });

    if (globalTemplate) {
      console.log("⚡ Cache HIT!");
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

    // --- שלב 3: הכנת הפרומפט הדינמי ---
    let specificRules = "";
    Object.keys(TECH_RULES).forEach((tech) => {
      if (cleanPrompt.includes(tech)) {
        specificRules += `\n### RULE FOR ${tech.toUpperCase()}:${TECH_RULES[tech]}`;
      }
    });
    
    if (cleanPrompt.includes("node") || cleanPrompt.includes("typescript")) {
       specificRules += `\n### RULE FOR TYPESCRIPT:${TECH_RULES["typescript"]}`;
       specificRules += `\n### RULE FOR NODE:${TECH_RULES["node"]}`;
    }

    // --- שלב 4: יצירה עם AI (פרומפט משודרג עם התקנות אוטומטיות) ---
    console.log("🤖 Cache MISS. Asking OpenAI...");
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Senior DevOps Architect. Generate a **Production-Ready, Interactive Starter Kit**.
          
          ### GOAL: 
          Zero-friction developer experience. Download -> Setup -> Run.

          ### DYNAMIC TECH RULES (STRICTLY FOLLOW THESE):
          ${specificRules}

          ### REQUIRED OUTPUT (JSON):
          1. Root key: "project_root".
          2. All files must be string values.
          
          ### MANDATORY CONTENTS (CRITICAL):
          1. **Project Structure:** - **MUST** have a 'src' folder.
             - **MUST** generate actual application code inside 'src' (e.g. src/main.py, src/index.ts).
             - Do NOT put app logic in the root.
          2. **Dependency Consistency:** Ensure EVERY imported module is listed in package.json/requirements.txt.

          ### THE "ZERO CONFIG" LOGIC (UPDATED):
          1. **Analyze Requirements:** Determine needed env vars.
          2. **.env.example:** Create file with placeholders.
          3. **scripts/setup.js:** Create a Node.js script (native 'readline', 'fs', 'child_process') that:
             - Welcomes user.
             - Iterates keys in .env.example and asks for values.
             - Writes to .env.
             - **NEW FEATURE:** Asks "Do you want to install dependencies now? (y/n)".
             - If 'y': Detects OS/Language and runs 'npm install' or 'pip install -r requirements.txt'.
             - Prints: "✅ Setup complete! Run 'npm run dev' (or docker compose up) to start."
          4. **package.json:** ALWAYS create this file (even for Python/Go) just to run the setup script:
             - "scripts": { "setup": "node scripts/setup.js" }

          ### README.md:
          - Clear instructions: 1. npm run setup (handles install & config), 2. docker compose up.
          
          ### EXAMPLE JSON:
          {
            "project_root": {
              "package.json": "{ \"scripts\": { \"setup\": \"node scripts/setup.js\" } ... }",
              "scripts": { "setup.js": "const { execSync } = require('child_process'); ..." },
              "src": { "main.py": "..." },
              "README.md": "..."
            }
          }
          `
        },
        { 
          role: "user", 
          content: `Generate a starter kit for: ${prompt}. Make sure setup.js includes auto-installation logic.` 
        }
      ],
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("AI returned empty content");

    const structure = JSON.parse(content);
    const rootKey = Object.keys(structure)[0];

    // --- שלב 5: יצירת ZIP והעלאה ---
    const zip = new JSZip();
    parseStructure(zip, structure[rootKey]);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const fileName = `boilerplate-${crypto.randomUUID()}.zip`; // שימוש ב-UUID
    const { error: uploadError } = await supabase.storage
      .from("boilerplates")
      .upload(fileName, zipBuffer, { contentType: "application/zip" });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage
      .from("boilerplates")
      .getPublicUrl(fileName);

    await prisma.template.create({
      data: {
        prompt: cleanPrompt,
        s3Url: publicUrlData.publicUrl,
        downloads: 1,
        userId: userId || null 
      }
    });

    console.log("✅ New template saved!");
    return NextResponse.json({ url: publicUrlData.publicUrl, cached: false });

  } catch (error: any) {
    console.error("🔴 Error:", error);
    return NextResponse.json({ error: "Failed to generate project" }, { status: 500 });
  }
}