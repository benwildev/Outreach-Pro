import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="flex flex-col items-center gap-4">
        <div className="bg-black rounded-full overflow-hidden p-2 shadow-xl mb-2">
          <Image
            src="/icon.png"
            alt="BW Logo"
            width={80}
            height={80}
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
