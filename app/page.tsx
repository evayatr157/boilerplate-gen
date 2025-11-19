"use client";

import { useState, useEffect } from "react";

// --- Data Constants ---
const TECH_STACKS: Record<string, string[]> = {
  "Node.js (TypeScript)": ["Express", "NestJS", "Next.js (App Router)", "Fastify", "Hono", "Remix"],
  "Python": ["FastAPI", "Django", "Flask", "Tornado", "Litestar"],
  "Java": ["Spring Boot", "Jakarta EE", "Quarkus", "Micronaut"],
  "Go (Golang)": ["Gin", "Echo", "Fiber", "Chi", "Standard Lib"],
  "C# (.NET)": [".NET Web API", "Blazor Server", "Blazor Wasm", "ASP.NET MVC"],
  "Rust": ["Actix-web", "Axum", "Rocket", "Tokio"],
  "PHP": ["Laravel", "Symfony", "CodeIgniter", "Slim"],
  "Ruby": ["Ruby on Rails", "Sinatra", "Hanami"]
};

const DATABASES = [
  "PostgreSQL (Prisma)", "PostgreSQL (TypeORM)", "MongoDB (Mongoose)", 
  "MySQL", "SQLite", "Redis", "Supabase", "Firebase", "None"
];

const AUTH_OPTIONS = ["None", "JWT (Custom)", "NextAuth.js", "Firebase Auth", "Auth0", "Clerk"];
const TESTING_TOOLS = ["None", "Jest", "Vitest", "PyTest", "JUnit", "Cypress"];

export default function Home() {
  // --- State Management ---
  const [language, setLanguage] = useState("Node.js (TypeScript)");
  const [framework, setFramework] = useState(TECH_STACKS["Node.js (TypeScript)"][0]);
  const [db, setDb] = useState("PostgreSQL (Prisma)");
  
  // Advanced Settings State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [auth, setAuth] = useState("None");
  const [testing, setTesting] = useState("None");
  const [docker, setDocker] = useState(false);
  const [ciCd, setCiCd] = useState(false);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // Auto-update framework when language changes
  useEffect(() => {
    setFramework(TECH_STACKS[language][0]);
  }, [language]);

  const handleGenerate = async () => {
    setLoading(true);
    setStatus("Checking existing architectures...");

    // Constructing the Prompt
    let prompt = `Language: ${language}, Framework: ${framework}, Database: ${db}`;
    
    if (auth !== "None") prompt += `, Authentication: ${auth}`;
    if (testing !== "None") prompt += `, Testing: ${testing}`;
    if (docker) prompt += `, Include Dockerfile & docker-compose`;
    if (ciCd) prompt += `, Include GitHub Actions CI/CD workflow`;

    console.log("Sending Prompt:", prompt);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (data.url) {
        setStatus(data.cached ? "Cache HIT! ⚡ Instant Download" : "Freshly Baked by AI! 🤖 Downloading...");
        
        const a = document.createElement("a");
        a.href = data.url;
        a.download = `boilerplate-${framework.toLowerCase().replace(/ /g, "-")}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (error) {
      console.error(error);
      alert("Error generating project. Please try again.");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 flex flex-col items-center font-sans">
      
      {/* Hero Section */}
      <div className="text-center mb-10 space-y-3">
        <h1 className="text-5xl font-extrabold text-slate-800 tracking-tight">
          Code <span className="text-blue-600">Architect</span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Instantly generate production-ready boilerplates with 
          <span className="font-semibold text-slate-800"> Docker, CI/CD, and Best Practices.</span>
          <br/> Stop configuring, start coding.
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Terminal Header Style */}
        <div className="bg-slate-900 p-4 flex gap-2 items-center">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="ml-4 text-slate-400 text-sm font-mono opacity-70">~/scripts/generate-project.sh</span>
        </div>

        <div className="p-8 space-y-8">
          
          {/* Grid: Core Selections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Language */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Language</label>
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
              >
                {Object.keys(TECH_STACKS).map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            {/* Framework */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Framework</label>
              <select 
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
              >
                {TECH_STACKS[language].map((fm) => (
                  <option key={fm} value={fm}>{fm}</option>
                ))}
              </select>
            </div>

            {/* Database */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Database & ORM</label>
              <select 
                value={db}
                onChange={(e) => setDb(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
              >
                {DATABASES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <div className="border-t border-slate-100 pt-4">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-blue-600 font-semibold hover:text-blue-800 transition-colors text-sm"
            >
              {showAdvanced ? "🔽 Hide Advanced Settings" : "▶ Show Advanced Settings"}
            </button>

            {/* Advanced Panel */}
            {showAdvanced && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50 p-6 rounded-xl animate-in fade-in slide-in-from-top-4 duration-300 border border-blue-100">
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-800 uppercase tracking-wider">Authentication</label>
                  <select 
                    value={auth} onChange={(e) => setAuth(e.target.value)}
                    className="w-full p-2 bg-white border border-blue-200 rounded text-sm shadow-sm"
                  >
                    {AUTH_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-800 uppercase tracking-wider">Testing Framework</label>
                  <select 
                    value={testing} onChange={(e) => setTesting(e.target.value)}
                    className="w-full p-2 bg-white border border-blue-200 rounded text-sm shadow-sm"
                  >
                    {TESTING_TOOLS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                {/* Checkboxes */}
                <div className="flex items-center space-x-3 bg-white p-3 rounded border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
                  <input 
                    type="checkbox" id="docker" checked={docker} onChange={(e) => setDocker(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                  />
                  <label htmlFor="docker" className="text-sm font-medium text-slate-700 cursor-pointer select-none">🐳 Include Docker</label>
                </div>

                <div className="flex items-center space-x-3 bg-white p-3 rounded border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
                  <input 
                    type="checkbox" id="cicd" checked={ciCd} onChange={(e) => setCiCd(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                  />
                  <label htmlFor="cicd" className="text-sm font-medium text-slate-700 cursor-pointer select-none">🤖 GitHub Actions CI/CD</label>
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="space-y-4">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className={`w-full py-4 px-6 text-lg font-bold text-white rounded-xl shadow-lg transition-all transform active:scale-[0.98] ${
                loading 
                  ? "bg-slate-400 cursor-not-allowed" 
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-500/30"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Architecting Solution...
                </span>
              ) : (
                "Generate Boilerplate 🚀"
              )}
            </button>

            {/* Logs / Status */}
            {status && (
              <div className={`text-center p-4 rounded-lg border text-sm font-mono font-medium animate-in fade-in slide-in-from-bottom-2 ${
                status.includes("Cache") 
                  ? "bg-green-50 border-green-200 text-green-700" 
                  : "bg-indigo-50 border-indigo-200 text-indigo-700"
              }`}>
                {`> ${status}`}
              </div>
            )}
          </div>

        </div>
      </div>

      <div className="mt-10 text-slate-400 text-sm">
        © 2025 Boilerplate Gen | Built for Developers
      </div>
    </div>
  );
}