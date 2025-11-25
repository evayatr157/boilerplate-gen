"use client";

import { useState, useEffect, Suspense } from "react";
import { SignedIn, SignedOut, SignInButton, UserButton, useClerk, useUser } from "@clerk/nextjs";
import { useSearchParams } from 'next/navigation';

// --- 1. הגדרות טכנולוגיה בסיסיות ---
const TECH_CONFIG: Record<string, { frameworks: string[]; databases: string[] }> = {
  "Node.js (TypeScript)": {
    frameworks: ["Express", "NestJS", "Fastify", "Next.js (App Router)"],
    databases: ["PostgreSQL (Prisma)", "MongoDB (Mongoose)", "MySQL (TypeORM)", "Redis", "None"]
  },
  "Python": {
    frameworks: ["FastAPI", "Django", "Flask"],
    databases: ["PostgreSQL (SQLAlchemy)", "PostgreSQL (Prisma)", "MongoDB (Motor)", "SQLite", "None"]
  },
  "Go (Golang)": {
    frameworks: ["Gin", "Echo", "Fiber", "Standard Lib"],
    databases: ["PostgreSQL (GORM)", "PostgreSQL (Pgx)", "MongoDB", "Redis", "None"]
  },
  "Java": {
    frameworks: ["Spring Boot", "Quarkus"],
    databases: ["PostgreSQL (JPA)", "MySQL", "MongoDB", "None"]
  },
  "C# (.NET)": {
    frameworks: ["ASP.NET Web API", "Blazor Server"],
    databases: ["SQL Server (EF Core)", "PostgreSQL (EF Core)", "MongoDB", "None"]
  },
  "Rust": {
    frameworks: ["Actix-web", "Axum"],
    databases: ["PostgreSQL (Diesel)", "PostgreSQL (SQLx)", "None"]
  },
  "PHP": {
    frameworks: ["Laravel", "Symfony"],
    databases: ["MySQL (Eloquent)", "PostgreSQL", "None"]
  },
  "Ruby": {
    frameworks: ["Ruby on Rails", "Sinatra"],
    databases: ["PostgreSQL", "SQLite", "None"]
  }
};

// --- 2. התאמת כלי עזר ---
const COMPATIBLE_TOOLS: Record<string, { auth: string[]; testing: string[] }> = {
  "Node.js (TypeScript)": { auth: ["None", "JWT", "Clerk", "Auth0"], testing: ["None", "Jest", "Vitest"] },
  "Python": { auth: ["None", "JWT", "Auth0"], testing: ["None", "PyTest", "Unittest"] },
  "Go (Golang)": { auth: ["None", "JWT", "Auth0"], testing: ["None", "Go Test"] },
  "Java": { auth: ["None", "Spring Security"], testing: ["None", "JUnit"] },
  "C# (.NET)": { auth: ["None", "Identity"], testing: ["None", "xUnit"] },
  "Rust": { auth: ["None", "JWT"], testing: ["None", "Cargo Test"] },
  "PHP": { auth: ["None", "Sanctum"], testing: ["None", "PHPUnit"] },
  "Ruby": { auth: ["None", "Devise"], testing: ["None", "RSpec"] }
};

const API_STYLES = ["REST", "GraphQL", "gRPC", "WebSocket"];
const LOADING_MESSAGES = ["🧠 Analyzing requirements...", "🏗️ Scaffolding architecture...", "🐳 Configuring Docker...", "🔧 Setting up CI/CD...", "📦 Finalizing package..."];

// --- קומפוננטה פנימית: מכילה את כל הלוגיקה של הטופס וה-State ---
function GeneratorContent() {
  const defaultLang = "Node.js (TypeScript)";
  
  // Hooks
  const { openSignIn } = useClerk();
  const { isSignedIn, user } = useUser();
  const searchParams = useSearchParams();

  // Basic State
  const [language, setLanguage] = useState(defaultLang);
  const [framework, setFramework] = useState(TECH_CONFIG[defaultLang].frameworks[0]);
  const [db, setDb] = useState(TECH_CONFIG[defaultLang].databases[0]);
  
  // Advanced State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [auth, setAuth] = useState("None");
  const [testing, setTesting] = useState("None");
  
  // New Advanced Features State
  const [apiStyle, setApiStyle] = useState("REST");
  const [docker, setDocker] = useState(false);
  const [ciCd, setCiCd] = useState(false);
  const [swagger, setSwagger] = useState(false);
  const [worker, setWorker] = useState(false);
  const [terraform, setTerraform] = useState(false);
  const [vectorDb, setVectorDb] = useState(false);

  // Status State
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [downloadCount, setDownloadCount] = useState<number | null>(null);

  // --- פונקציה לעדכון הסטטיסטיקות ---
  const refreshStats = () => {
    fetch("/api/stats")
      .then(res => res.json())
      .then(data => setDownloadCount(data.count))
      .catch(err => console.error("Failed to fetch stats", err));
  };

  // טעינה ראשונית + עדכון אוטומטי
  useEffect(() => {
    refreshStats(); 
    const interval = setInterval(refreshStats, 10000); 
    return () => clearInterval(interval);
  }, []);

  // קריאת פרמטרים מה-URL (לדפי נחיתה)
  useEffect(() => {
    const urlLang = searchParams.get('lang');
    const urlDb = searchParams.get('db');
    const urlFrame = searchParams.get('framework');

    if (urlLang && TECH_CONFIG[urlLang]) {
      handleLanguageChange(urlLang); // שימוש בפונקציית העזר
      
      if (urlFrame) setFramework(urlFrame);
      if (urlDb) setDb(urlDb);
    }
  }, [searchParams]);

  // פונקציית עזר לשינוי שפה (מאפסת את הכלים התואמים)
  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    const config = TECH_CONFIG[newLang];
    const tools = COMPATIBLE_TOOLS[newLang] || COMPATIBLE_TOOLS["Node.js (TypeScript)"];
    
    setFramework(config.frameworks[0]);
    setDb(config.databases[0]);
    setAuth(tools.auth[0]);
    setTesting(tools.testing[0]);
  };

  // אנימציית טעינה
  useEffect(() => {
    if (!loading) return;
    setStatus(LOADING_MESSAGES[0]);
    let msgIndex = 0;
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
      setStatus(LOADING_MESSAGES[msgIndex]);
    }, 2500);
    return () => clearInterval(interval);
  }, [loading]);

  const handleGenerate = async () => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }

    console.log("User generating project:", user?.primaryEmailAddress?.emailAddress);
    setLoading(true);

    let prompt = `Language: ${language}, Framework: ${framework}, Database: ${db}, API Style: ${apiStyle}`;
    if (auth !== "None") prompt += `, Authentication: ${auth}`;
    if (testing !== "None") prompt += `, Testing: ${testing}`;
    
    if (docker) prompt += `, Include Dockerfile & docker-compose`;
    if (ciCd) prompt += `, Include GitHub Actions CI/CD`;
    if (swagger) prompt += `, Include Swagger/OpenAPI documentation`;
    if (worker) prompt += `, Include Background Worker (Redis)`;
    if (terraform) prompt += `, Include Terraform IaC scripts`;
    if (vectorDb) prompt += `, Include Vector DB setup (Pinecone/Chroma)`;

    try {
      await new Promise(resolve => setTimeout(resolve, 4000)); // TODO: remove

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (data.url) {
        setStatus(data.cached ? "⚡ Cache HIT!" : "✅ Done!");
        setDownloadCount((prev) => (prev !== null ? prev + 1 : 1));
        refreshStats();

        const a = document.createElement("a");
        a.href = data.url;
        a.download = `boilerplate-${framework.toLowerCase().replace(/ /g, "-")}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (error: any) {
      console.error(error);
      if (error.name === 'AbortError') alert("Request timed out. Try generating a smaller project.");
      else alert(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 4000);
    }
  };

  return (
    <div className="py-8 px-4 flex flex-col items-center">
      <div className="text-center mb-10 space-y-3">
        <h1 className="text-5xl font-extrabold text-slate-800 tracking-tight">
          Generate Production-Ready <br/> <span className="text-blue-600">Backend Boilerplates</span>
        </h1>

        {/* Counter Badge */}
        {downloadCount !== null && (
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1 rounded-full text-sm font-medium border border-blue-100 shadow-sm animate-fade-in transition-all duration-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            {downloadCount.toLocaleString()} Projects Generated so far
          </div>
        )}

        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Stop configuring. Start coding. Get Docker, Auth, and Cloud Infra in seconds.
        </p>
      </div>

      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden relative">
        <div className="bg-slate-900 p-4 flex gap-2 items-center">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="ml-4 text-slate-400 text-sm font-mono opacity-70">~/generate.sh</span>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Language</label>
              <select 
                value={language} 
                onChange={(e) => handleLanguageChange(e.target.value)} 
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg outline-none"
              >
                {Object.keys(TECH_CONFIG).map((lang) => <option key={lang} value={lang}>{lang}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Framework</label>
              <select value={framework} onChange={(e) => setFramework(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg outline-none">
                {TECH_CONFIG[language].frameworks.map((fm) => <option key={fm} value={fm}>{fm}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">API Style</label>
              <select value={apiStyle} onChange={(e) => setApiStyle(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg outline-none">
                {API_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Database</label>
              <select value={db} onChange={(e) => setDb(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg outline-none">
                {TECH_CONFIG[language].databases.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center text-blue-600 font-semibold hover:text-blue-800 text-sm">
              {showAdvanced ? "🔽 Hide Advanced Settings" : "▶ Show Advanced Settings"}
            </button>

            {showAdvanced && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50 p-6 rounded-xl animate-in fade-in slide-in-from-top-4 border border-blue-100">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-800 uppercase">Authentication</label>
                  <select value={auth} onChange={(e) => setAuth(e.target.value)} className="w-full p-2 bg-white border rounded text-sm">
                    {(COMPATIBLE_TOOLS[language]?.auth || ["None"]).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-800 uppercase">Testing</label>
                  <select value={testing} onChange={(e) => setTesting(e.target.value)} className="w-full p-2 bg-white border rounded text-sm">
                    {(COMPATIBLE_TOOLS[language]?.testing || ["None"]).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                
                <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4 mt-2">
                  <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={docker} onChange={(e) => setDocker(e.target.checked)} className="w-4 h-4 text-blue-600"/>
                      <label className="text-sm font-medium text-slate-700">🐳 Docker</label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={ciCd} onChange={(e) => setCiCd(e.target.checked)} className="w-4 h-4 text-blue-600"/>
                      <label className="text-sm font-medium text-slate-700">🤖 CI/CD (GitHub)</label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={swagger} onChange={(e) => setSwagger(e.target.checked)} className="w-4 h-4 text-blue-600"/>
                      <label className="text-sm font-medium text-slate-700">📜 Swagger / OpenAPI</label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={worker} onChange={(e) => setWorker(e.target.checked)} className="w-4 h-4 text-blue-600"/>
                      <label className="text-sm font-medium text-slate-700">⚙️ Background Worker</label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={terraform} onChange={(e) => setTerraform(e.target.checked)} className="w-4 h-4 text-blue-600"/>
                      <label className="text-sm font-medium text-slate-700">☁️ Terraform</label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={vectorDb} onChange={(e) => setVectorDb(e.target.checked)} className="w-4 h-4 text-blue-600"/>
                      <label className="text-sm font-medium text-slate-700">🧠 Vector DB (AI)</label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className={`w-full py-4 px-6 text-lg font-bold text-white rounded-xl shadow-lg transition-all transform active:scale-[0.98] ${
              loading ? "bg-slate-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/30"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> {status}
              </span>
            ) : "Generate Boilerplate 🚀"}
          </button>
        </div>
      </div>
      <div className="mt-10 text-slate-400 text-sm pb-8">© {new Date().getFullYear()} Evyatar Shveka</div>
    </div>
  );
}

// --- קומפוננטה ראשית (מעטפת): מטפלת ב-Suspense ---
export default function HomeWrapper() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
      {/* Navbar */}
      <nav className="w-full flex justify-between items-center p-6 px-8 max-w-7xl mx-auto">
         <div className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="text-2xl">🏗️</span> Code Architect
         </div>
         <div className="flex items-center gap-4">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="bg-white text-blue-600 px-5 py-2 rounded-full font-bold shadow-sm hover:shadow-md transition-all border border-blue-100">Sign In</button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <div className="flex items-center gap-4">
                <a href="/dashboard" className="text-sm font-bold text-slate-600 hover:text-blue-600 transition">History</a>
                <UserButton afterSignOutUrl="/" />
              </div>
            </SignedIn>
         </div>
      </nav>

      {/* התוכן עטוף ב-Suspense בשביל useSearchParams */}
      <Suspense fallback={<div className="text-center py-20 text-slate-500">Loading...</div>}>
        <GeneratorContent />
      </Suspense>
    </div>
  );
}