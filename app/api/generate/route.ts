import { NextResponse } from "next/server";
import OpenAI from "openai";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// --- הגדרות אבטחה ---
const MAX_DAILY_GENERATIONS = 15; 
const MAX_PROMPT_LENGTH = 600;
const TECH_RULES: Record<string, string> = {
  // --- Database Rules ---
  "mongodb": `
    - **NestJS (CRITICAL):** Use package '@nestjs/mongoose' AND 'mongoose'. Do NOT use 'nestjs-mongoose' (it does not exist).
    - **Mongoose Config:** Do NOT use 'useNewUrlParser' or 'useUnifiedTopology' (deprecated).
    - **Types:** Do NOT add '@types/mongoose' to package.json.
    - **Non-JS:** Use official drivers (e.g., 'MongoDB.Driver' for C#, 'mongo-go-driver' for Go).`,
  
  "postgres": `
    - **Connection:** Ensure connection string uses 'postgresql://' protocol.`,

  // --- Language Rules ---
  "node": `
    - **Docker:** Use 'COPY package*.json ./' (WITH WILDCARD).
    - **Env:** Include 'dotenv'.
    - **Structure:** Use 'src/' folder.
    - **Dependencies (CRITICAL):** You MUST add '@types/node' to devDependencies if using TypeScript.
    - **Scripts:** Ensure 'package.json' has a "build" script.`,
    
    "typescript": `
    - **Config (CRITICAL):** 'tsconfig.json' MUST include:
      "experimentalDecorators": true,
      "emitDecoratorMetadata": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "noImplicitAny": false.`,

  "nestjs": `
    - **SPEED:** Generate a MINIMAL scaffold (AppModule, AppController only). Do NOT generate full CRUD resources (to prevent timeout).
    - **Docker:** Use 'COPY package*.json ./'.`,

  "python": `
    - **SPEED (CRITICAL):** For FastAPI/Flask, generate ONLY 'src/main.py' and 'requirements.txt'.
    - **Structure:** All python code in 'src/'.
    - **Venv:** Setup script should use 'python -m venv venv'.
    - **Docker:** Use 'python:3.9-slim'. Ensure 'COPY requirements.txt .'.`,

  "django": `
    - **SPEED (CRITICAL):** Generate a single-app project. Do NOT generate admin files or complex migrations. Keep it minimal to prevent timeout.
    - **Docker:** Use 'python:3.9-slim'.`,
    
    "c#": `
    - **Structure:** Solution (.sln) in root, Project (.csproj) in 'src/'.
    - **Code Style (CRITICAL):** ALWAYS include 'using System;' and 'using System.Collections.Generic;' in ALL C# files.
    - **Style:** Use standard .NET 6+ style (Program.cs with builder), no Startup.cs.
    - **Docker (CRITICAL):**
      1. Use 'mcr.microsoft.com/dotnet/sdk:6.0' for build.
      2. Use 'mcr.microsoft.com/dotnet/aspnet:6.0' for runtime.
      3. ENTRYPOINT: Use wildcard to find DLL: ENTRYPOINT ["sh", "-c", "dotnet *.dll"] inside the /app folder.`,

    "java": `
    - **Structure:** src/main/java.
    - **Config (CRITICAL):** In 'pom.xml', YOU MUST include <parent> section for 'spring-boot-starter-parent' version '3.2.0'.
    - **Build Name:** Add <finalName>app</finalName> inside <build> section of pom.xml.
    - **Env Vars:** Use standard naming (e.g. 'SPRING_DATASOURCE_URL'), NO spaces in keys.
    - **Docker (CRITICAL):** Use MULTI-STAGE build with WORKDIR.
      1. Stage 1: FROM maven:3.9-eclipse-temurin-17 AS build -> WORKDIR /app -> COPY . . -> RUN mvn clean package -DskipTests
      2. Stage 2: FROM eclipse-temurin:17-jdk-jammy -> WORKDIR /app -> COPY --from=build /app/target/app.jar app.jar -> ENTRYPOINT ["java","-jar","app.jar"]`,

    "go": `
    - **SPEED (CRITICAL):** Generate ONLY 'main.go' and 'go.mod'.
    - **Docker:** Use 'FROM golang:1.21-alpine'.
    - **Dependencies:** In go.mod, do NOT pin old versions. Use 'go 1.21' directive.
    - **Build Steps (CRITICAL ORDER):**
      1. COPY go.mod ./
      2. COPY src/*.go ./
      3. RUN go mod tidy
      4. RUN go build -o main .`,

  "ruby": `
    - **Config:** Include 'Gemfile'.
    - **Docker:** Use 'ruby:3.2-alpine'.`,

  "php": `
    - **Config:** Include 'composer.json'.
    - **Docker:** Use 'php:8.2-apache'.`,

  "rust": `
    - **Config:** Include 'Cargo.toml'.
    - **Docker:** Use multi-stage build.`,

  "kotlin": `
    - **Structure:** src/main/kotlin.
    - **Config:** 'build.gradle.kts'.`,

  "swift": `
    - **Config:** 'Package.swift'.
    - **Docker:** swift:5.8 image.`,

  "elixir": `
    - **Config:** 'mix.exs'.
    - **Docker:** elixir:1.14-alpine.`,
  
  "graphql": `
    - **Schema:** Create a basic schema.graphql or code-first approach.
    - **Server:** Use Apollo Server (Node) or Strawberry/Ariadne (Python).`,

  "swagger": `
    - **Docs:** Generate a 'swagger.yaml' file or enable auto-docs (FastAPI/NestJS).`,

  "worker": `
    - **Redis:** Include redis service in docker-compose.yml.
    - **Code:** Create a simple worker script/entry point.`,

  "terraform": `
    - **IaC:** Create a 'terraform/' folder with 'main.tf' (provider: AWS/Local) and 'variables.tf'.`,

  "vector": `
    - **Deps:** Install pinecone-client or chroma-db client.
    - **Env:** Add VECTOR_DB_API_KEY to .env.example.`,

  // --- Tool Rules ---
  "prisma": `
    - **Python:** Use 'pip install prisma'. Run 'prisma generate'.
    - **Node:** Use 'npm install prisma'.`,
    
    "docker": `
    - **YAML Formatting (CRITICAL):** The content of 'docker-compose.yml' MUST be a multi-line string with proper YAML indentation. Do NOT generate a single-line string with literal '\\n' characters.
    - **Syntax:** ALWAYS put a space after the colon (e.g., "version: '3.8'", NOT "version:'3.8'").
    - **Build:** Ensure dependency install runs BEFORE build command.`,
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
    
    if (!prompt || typeof prompt !== 'string') return NextResponse.json({ error: "Invalid prompt" }, { status: 400 });
    if (prompt.length > MAX_PROMPT_LENGTH) return NextResponse.json({ error: "Prompt too long" }, { status: 400 });

    const cleanPrompt = prompt.trim().toLowerCase(); 

    // --- DB OPERATIONS (SAFE MODE) ---
    // מגן מפני נפילת שרת/WiFi אוניברסיטה
    let globalTemplate = null;
    let dbAvailable = true;

    try {
        if (userId) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const count = await prisma.template.count({
                where: { userId: userId, createdAt: { gte: today } }
            });
            
            // מדלגים על הבדיקה ב-DEV כדי לא לחסום QA
            if (process.env.NODE_ENV !== 'development' && count >= MAX_DAILY_GENERATIONS) {
                return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
            }
        }

        // Cache Check
        globalTemplate = await prisma.template.findFirst({
            where: { prompt: cleanPrompt, s3Url: { not: "" } },
            orderBy: { createdAt: 'desc' }
        });

    } catch (dbError) {
        console.warn("⚠️ Database unavailable (skipping checks):", dbError);
        dbAvailable = false;
    }

    if (globalTemplate) {
        console.log("⚡ Cache HIT!");
        // עדכון סטטיסטיקות ברקע אם אפשר
        if (dbAvailable) {
            prisma.template.update({
                where: { id: globalTemplate.id },
                data: { downloads: { increment: 1 } },
            }).catch(() => {});
            
            if (userId) {
                 prisma.template.create({
                    data: { prompt: cleanPrompt, s3Url: globalTemplate.s3Url, downloads: 1, userId: userId }
                }).catch(() => {});
            }
        }
        return NextResponse.json({ url: globalTemplate.s3Url, cached: true });
    }

    // --- AI Generation ---
    let specificRules = "";
    Object.keys(TECH_RULES).forEach((tech) => {
      if (cleanPrompt.includes(tech.toLowerCase())) {
        specificRules += `\n### RULE FOR ${tech.toUpperCase()}:${TECH_RULES[tech]}`;
      }
    });
    
    // Manual Triggers for Advanced Features
    if (cleanPrompt.includes("graphql")) specificRules += `\n### RULE FOR GRAPHQL:${TECH_RULES["graphql"]}`;
    if (cleanPrompt.includes("swagger")) specificRules += `\n### RULE FOR SWAGGER:${TECH_RULES["swagger"]}`;
    if (cleanPrompt.includes("worker")) specificRules += `\n### RULE FOR WORKER:${TECH_RULES["worker"]}`;
    if (cleanPrompt.includes("terraform")) specificRules += `\n### RULE FOR TERRAFORM:${TECH_RULES["terraform"]}`;
    if (cleanPrompt.includes("vector")) specificRules += `\n### RULE FOR VECTOR_DB:${TECH_RULES["vector"]}`;

    if (cleanPrompt.includes("node") || cleanPrompt.includes("typescript") || cleanPrompt.includes("express") || cleanPrompt.includes("nest")) {
       specificRules += `\n### RULE FOR TYPESCRIPT:${TECH_RULES["typescript"]}`;
       specificRules += `\n### RULE FOR NODE:${TECH_RULES["node"]}`;
    }
    if (cleanPrompt.includes("nest")) specificRules += `\n### RULE FOR NESTJS:${TECH_RULES["nestjs"]}`;

    if (cleanPrompt.includes("django")) specificRules += `\n### RULE FOR DJANGO:${TECH_RULES["django"]}`;

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
          
          ### MANDATORY CONTENTS:
          1. **Project Structure:** - **MUST** have a 'src' folder (for supported languages).
             - **MUST** generate actual application code inside 'src' (e.g. src/main.py, src/index.ts).
          2. **Dependency Consistency:** Ensure EVERY imported module is listed in package.json/requirements.txt.

          ### THE "ZERO CONFIG" LOGIC:
          1. **Analyze Requirements:** Determine needed env vars.
          2. **.env.example:** Create file with placeholders.
          3. **scripts/setup.js:** Create a Node.js script (native 'readline', 'fs', 'child_process') that:
             - Welcomes user.
             - Parses .env.example line-by-line. IGNORING comments (#) and empty lines.
             - Extracts key (part before first '='). Throws error if key has spaces.
             - Asks for values & writes to .env.
             - **Auto-Install:** Asks "Install dependencies? (y/n)". If 'y', runs install command (npm install / pip install / dotnet restore) in try-catch.
             - **Auto-Git (NEW):** Asks "Initialize Git repository? (y/n)". If 'y', runs 'git init' and 'git add .'.
             - Prints success message.

          4. **package.json:** ALWAYS create this file to run the setup script:
             - "scripts": { "setup": "node scripts/setup.js" }

          ### README.md:
          - Instructions: 1. npm run setup, 2. docker compose up.
          
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
          content: `Generate a starter kit for: ${prompt}. Keep code minimal to prevent timeout.` 
        }
      ],
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("AI returned empty content");

    const structure = JSON.parse(content);
    const rootKey = Object.keys(structure)[0];

    // --- ZIP & Upload ---
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

    // Save to DB (Safe Mode)
    if (dbAvailable) {
        try {
            await prisma.template.create({
                data: { prompt: cleanPrompt, s3Url: publicUrlData.publicUrl, downloads: 1, userId: userId || null }
            });
            console.log("✅ Template saved to DB!");
        } catch (e) {
            console.warn("⚠️ DB save failed:", e);
        }
    }

    return NextResponse.json({ url: publicUrlData.publicUrl, cached: false });

  } catch (error: any) {
    console.error("🔴 Error:", error);
    return NextResponse.json({ error: "Failed to generate project" }, { status: 500 });
  }
}