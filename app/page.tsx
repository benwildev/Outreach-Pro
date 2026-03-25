import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full overflow-hidden shadow-xl mb-2 border border-slate-200">
          <Image
            src="/logo.png"
            alt="Benwill Outreach"
            width={96}
            height={96}
            className="object-contain"
          />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 text-center">
          Benwill Outreach System
        </h1>
        <p className="text-muted-foreground text-lg text-center max-w-md">
          Manage your outreach campaigns and leads in one place.
        </p>
      </div>
      <Button asChild size="lg" className="mt-4 px-8 text-lg rounded-full shadow-lg">
        <Link href="/dashboard">Go to Dashboard</Link>
      </Button>
    </main>
  );
}
