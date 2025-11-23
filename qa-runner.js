const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

// --- רשימת הזהב: השילובים הכי פופולריים בשוק ---
const SCENARIOS = [
  // 1. הקלאסיקה של נוד (MERN Stack Backend)
  "Node.js (TypeScript), Express, MongoDB (Mongoose), Include Docker",
  
  // 2. הסטנדרט המודרני לאנטרפרייז (Node)
  "Node.js (TypeScript), NestJS, PostgreSQL (Prisma), Include Docker",
  
  // 3. הפיתון המהיר (Modern Python)
  "Python, FastAPI, PostgreSQL (Prisma), Include Docker",
  
  // 4. הפיתון הקלאסי (Data Science / Enterprise)
  "Python, Django, PostgreSQL (SQLAlchemy), Include Docker",
  
  // 5. ה-Go To לביצועים (Microservices)
  "Go (Golang), Gin, Redis, Include Docker"
];

const BASE_URL = "http://localhost:3000/api/generate"; 
const OUT_DIR = path.join(__dirname, "qa_output");

// ניקוי תיקיית הפלט מהרצה קודמת
if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR);

async function runTest() {
  console.log("🚀 Starting 'Golden Path' QA Test...\n");
  const errors = [];

  for (const [index, prompt] of SCENARIOS.entries()) {
    console.log(`\n🧪 Test ${index + 1}/${SCENARIOS.length}: ${prompt}`);
    const testDir = path.join(OUT_DIR, `test_${index}`);
    fs.mkdirSync(testDir);

    try {
      // A. שליחת בקשה ל-API (עם Timestamp כדי לעקוף Cache ולקבל תוצאה טרייה לבדיקה)
      console.log("   ⏳ Generating...");
      const uniquePrompt = `${prompt} --qa-${Date.now()}`; 
      
      const response = await fetch(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: uniquePrompt })
      });
      
      const data = await response.json();
      if (!data.url) throw new Error(data.error || "No URL returned");
      console.log("   ✅ Generated.");

      // B. הורדת ה-ZIP
      const zipBuffer = await fetch(data.url).then(res => res.arrayBuffer());
      const zipPath = path.join(testDir, "project.zip");
      fs.writeFileSync(zipPath, Buffer.from(zipBuffer));

      // C. חילוץ
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(testDir, true);
      
      // D. ניסיון Build עם Docker
      // אנחנו מריצים 'docker compose build' בלבד (בלי up) כדי לראות שהבנייה עוברת
      console.log("   🐳 Attempting Docker Build...");
      try {
        execSync(`docker compose build`, { cwd: testDir, stdio: 'pipe' }); 
        console.log("   🟢 BUILD SUCCESS!");
      } catch (buildError) {
        console.log("   🔴 BUILD FAILED!");
        // שמירת הלוג כדי שתוכל לנתח את השגיאה
        const errorLog = buildError.stderr.toString() + "\n" + buildError.stdout.toString();
        const errorFile = path.join(testDir, "error.log");
        fs.writeFileSync(errorFile, errorLog);
        
        errors.push({
          prompt,
          errorPath: errorFile
        });
      }

    } catch (error) {
      console.error(`   ❌ FATAL ERROR: ${error.message}`);
      errors.push({ prompt, error: error.message });
    }
  }
  
  // סיכום
  console.log("\n========================================");
  console.log("📊 QA SUMMARY");
  console.log("========================================");
  
  if (errors.length === 0) {
    console.log("✨ PERFECT! All popular stacks are building correctly.");
    console.log("   The Cache is now warmed up with valid templates.");
  } else {
    console.log(`⚠️  Found ${errors.length} failures:\n`);
    errors.forEach(e => {
      console.log(`❌ ${e.prompt}`);
      if (e.errorPath) console.log(`   See log: ${e.errorPath}`);
      else console.log(`   Error: ${e.error}`);
    });
  }
}

runTest();