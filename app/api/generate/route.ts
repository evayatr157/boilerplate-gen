import { NextResponse } from "next/server";
import OpenAI from "openai";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// --- 1. מילון החוקים החכם (המוח) ---
const TECH_RULES: Record<string, string> = {
  "mongodb": `
    - **Mongoose:** Do NOT use 'useNewUrlParser' or 'useUnifiedTopology' options (deprecated).
    - **Types:** Do NOT add '@types/mongoose' to package.json.
    - **C#/.NET:** Use the official 'MongoDB.Driver', NOT Mongoose.`,
  
  "express": `
    - **Types:** Include '@types/express' in devDependencies.`,
  
  "node": `
    - **Env:** Include 'dotenv'.
    - **Types:** Include '@types/node'.`,
  
  "typescript": `
    - **Config:** 'tsconfig.json' MUST have "skipLibCheck": true, "noImplicitAny": false.`,
  
  "python": `
    - **Structure:** All python code in 'src/'.
    - **Venv:** Setup script should handle venv creation if possible, or just pip install.
    - **Docker:** Use 'python:3.9-slim'.`,
    
  "c#": `
    - **Structure:** Solution (.sln) in root, Project (.csproj) in 'src/'.
    - **Docker:** 'COPY src/*.csproj ./' is incorrect. Ensure COPY paths match the generated file structure.
    - **Setup:** 'dotnet restore' might fail if SDK missing on user machine -> Wrap in try-catch and suggest Docker.`,

  "docker": `
    - **Build:** Ensure 'npm install' / 'pip install' / 'dotnet restore' runs BEFORE the build command.
    - **Context:** Verify COPY paths exist.`,

  "prisma": `
    - **Python:** Use 'pip install prisma'. Run 'prisma generate'.`
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
    const cleanPrompt = prompt.trim().toLowerCase(); 

    if (!cleanPrompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    // --- שלב 2: בניית החוקים הדינמיים ---
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

    // --- שלב 3: חיפוש ב-Cache ---
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

    // --- שלב 4: יצירה עם AI ---
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
          1. **Project Structure:** - **Code:** MUST have a 'src' folder for source code.
             - **Config:** Root level for 'package.json', 'Dockerfile', 'docker-compose.yml'.
             - **C#/.NET:** Ensure .csproj location matches Dockerfile COPY instruction.
          2. **Dependency Consistency:** Ensure EVERY imported module is listed in package.json/requirements.txt.

          ### THE "ZERO CONFIG" LOGIC:
          1. **Analyze Requirements:** Determine needed env vars.
          2. **.env.example:** Create file with placeholders.
          3. **scripts/setup.js:** Create a Node.js script (native 'readline' & 'fs') that:
             - Welcomes user.
             - Iterates keys in .env.example.
             - Asks for values.
             - Writes to .env.
             - Prints success message.
             - **Try to run install:** If possible, execute install command (npm install / pip install / dotnet restore) in a try-catch block.
          4. **package.json:** ALWAYS create this file (even for Python/C#/Go) just to run the setup script:
             - "scripts": { "setup": "node scripts/setup.js" }

          ### README.md:
          - Must explain: 1. npm install (for setup), 2. npm run setup, 3. docker compose up.
          
          ### EXAMPLE JSON:
          {
            "project_root": {
              "package.json": "{ \"scripts\": { \"setup\": \"node scripts/setup.js\" } ... }",
              "scripts": { "setup.js": "..." },
              "src": { "Program.cs": "..." },
              "README.md": "..."
            }
          }
          `
        },
        { 
          role: "user", 
          content: `Generate a starter kit for: ${prompt}. Ensure Dockerfile paths are correct for the generated structure.` 
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

    const fileName = `boilerplate-${crypto.randomUUID()}.zip`;
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