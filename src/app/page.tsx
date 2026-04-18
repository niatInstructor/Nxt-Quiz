// STD-08: Root redirect is now handled by next.config.ts redirects().
// This page is kept as a fallback.
import { redirect } from "next/navigation";
export default function Home() {
  return redirect("/login");
}
