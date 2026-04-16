"use client";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export default function Header() {
  const router = useRouter();

  const onClickLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-lg mb-8">
      <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">R</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">React Exam</h1>
        </div>
        <button
          onClick={onClickLogout}
          className="px-5 py-2 text-sm font-medium text-muted-foreground hover:text-danger border border-border rounded-xl hover:border-danger/30 transition-all"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
