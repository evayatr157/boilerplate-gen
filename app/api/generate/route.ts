import { NextResponse } from "next/server";
import OpenAI from "openai";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// --- מילון החוקים המורחב ---
const TECH_RULES: Record<string, string> = {
  "mongodb": `
    - **Mongoose 8+ Rules:** Do NOT use deprecated options like 'useNewUrlParser' in mongoose.connect().
    - **Types:** Do NOT add '@types/mongoose' to package.json.
    - **C#:** Use 'MongoDB.Driver'.
    - **Java:** Use 'spring-boot-starter-data-mongodb' if Spring.`,
  
  "node": `
    - **Env:** Include 'dotenv'.
    - **Types:** Include '@types/node'.`,
  
  "typescript": `
    - **Config:** 'tsconfig.json' MUST have "skipLibCheck": true, "noImplicitAny": false.`,
  
  "python": `
    - **Structure:** All python code in 'src/'.
    - **Venv:** Setup script should use 'python -m venv venv' if installing locally.
    - **Docker:** Use 'python:3.9-slim'.`,
    
  "c#": `
    - **Structure:** Solution (.sln) in root, Project (.csproj) in 'src/'.
    - **Docker:** Ensure COPY paths in Dockerfile match the actual structure (src/*.csproj).
    - **Setup:** Wrap 'dotnet restore' in try-catch.`,

  "java": `
    - **Structure:** Standard Maven/Gradle structure (src/main/java).
    - **Config:** Include pom.xml or build.gradle.
    - **Docker:** Use 'openjdk:17-jdk-slim'.`,

  "php": `
    - **Deps:** Include 'composer.json'.
    - **Docker:** Use 'php:8.2-apache' or 'fpm'.`,

  "rust": `
    - **Config:** Include 'Cargo.toml'.
    - **Docker:** Use multi-stage build (rust:latest -> debian:buster-slim) to keep image small.`,

  "prisma": `
    - **Python:** Use 'pip install prisma'. Run 'prisma generate'.
    - **Node:** Use 'npm install prisma'.`,
    
  "docker": `
    - **Build:** Ensure dependency install runs BEFORE build command.
    - **Context:** Verify COPY paths exist.`,
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

    // --- בניית חוקים דינמיים ---
    let specificRules = "";
    Object.keys(TECH_RULES).forEach((tech) => {
      if (cleanPrompt.includes(tech.toLowerCase())) {
        specificRules += `\n### RULE FOR ${tech.toUpperCase()}:${TECH_RULES[tech]}`;
      }
    });
    
    if (cleanPrompt.includes("node") || cleanPrompt.includes("typescript")) {
       specificRules += `\n### RULE FOR TYPESCRIPT:${TECH_RULES["typescript"]}`;
       specificRules += `\n### RULE FOR NODE:${TECH_RULES["node"]}`;
    }

    // --- Cache Check ---
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

    // --- AI Generation ---
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
          1. **Project Structure:** - **MUST** follow standard conventions for the language (e.g., src/ for JS/TS/Py, src/main/java for Java).
             - **MUST** generate actual application code (entry point, simple route).
          2. **Dependency Consistency:** Ensure EVERY imported module is listed in the manifest file (package.json, requirements.txt, go.mod, pom.xml, Cargo.toml).

          ### THE "ZERO CONFIG" LOGIC:
          1. **Analyze Requirements:** Determine needed env vars.
          2. **.env.example:** Create file with placeholders.
          3. **scripts/setup.js:** Create a Node.js script (native 'readline' & 'fs') that:
             - Welcomes user.
             - Iterates keys in .env.example.
             - Asks for values.
             - Writes to .env.
             - Prints success message.
             - **Try to run install:** If possible, execute install command (npm install / pip install / dotnet restore / mvn install) in a try-catch block.
          4. **package.json:** ALWAYS create this file (even for non-JS projects) just to run the setup script:
             - "scripts": { "setup": "node scripts/setup.js" }

          ### README.md:
          - Must explain: 1. npm install (for setup), 2. npm run setup, 3. How to run the actual app (docker compose up).
          
          ### EXAMPLE JSON:
          {
            "project_root": {
              "package.json": "{ \"scripts\": { \"setup\": \"node scripts/setup.js\" } ... }",
              "scripts": { "setup.js": "..." },
              "src": { "main.py": "..." },
              "README.md": "..."
            }
          }
          `
        },
        { 
          role: "user", 
          content: `Generate a starter kit for: ${prompt}. Include actual source code.` 
        }
      ],
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("AI returned empty content");

    const structure = JSON.parse(content);
    const rootKey = Object.keys(structure)[0];

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