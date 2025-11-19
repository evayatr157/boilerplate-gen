import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";

export default async function Dashboard() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/"); // אם לא מחובר - עוף הביתה
  }

  // שליפת הפרויקטים של המשתמש מהדאטהבייס
  const projects = await prisma.template.findMany({
    where: { userId: userId },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800">My Projects 📂</h1>
          <a href="/" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition">
            + New Project
          </a>
        </div>
        
        {projects.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-200">
            <p className="text-xl text-slate-500 mb-4">You haven't created any projects yet.</p>
            <a href="/" className="text-blue-600 font-bold hover:underline">Start building now &rarr;</a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((p) => (
              <div key={p.id} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition border border-slate-100 flex flex-col">
                <div className="mb-4">
                  <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                  <h3 className="font-bold text-lg text-slate-800 line-clamp-2" title={p.prompt}>
                    {p.prompt}
                  </h3>
                </div>
                
                <div className="mt-auto pt-4 border-t border-slate-50">
                  <a 
                    href={p.s3Url} 
                    className="flex items-center justify-center gap-2 w-full bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 py-2 rounded-lg font-medium transition"
                  >
                    <span>Download ZIP</span>
                    <span>⬇️</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}