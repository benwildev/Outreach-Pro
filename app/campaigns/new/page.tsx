import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createCampaign } from "../actions";

export default function NewCampaignPage() {
  return (
    <main className="container mx-auto max-w-xl py-10">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/campaigns">← Campaigns</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New Campaign</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createCampaign} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                name="name"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Campaign name"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="subject" className="text-sm font-medium">
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Email subject"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="body" className="text-sm font-medium">
                Body
              </label>
              <textarea
                id="body"
                name="body"
                required
                rows={5}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Email body"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="followup1" className="text-sm font-medium">
                Follow-up 1 (optional)
              </label>
              <textarea
                id="followup1"
                name="followup1"
                rows={3}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="First follow-up message"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="followup2" className="text-sm font-medium">
                Follow-up 2 (optional)
              </label>
              <textarea
                id="followup2"
                name="followup2"
                rows={3}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Second follow-up message"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="delay1Days" className="text-sm font-medium">
                  Delay 1 (days)
                </label>
                <input
                  id="delay1Days"
                  name="delay1Days"
                  type="number"
                  min={1}
                  defaultValue={3}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="delay2Days" className="text-sm font-medium">
                  Delay 2 (days)
                </label>
                <input
                  id="delay2Days"
                  name="delay2Days"
                  type="number"
                  min={1}
                  defaultValue={3}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="provider" className="text-sm font-medium">
                Provider
              </label>
              <select
                id="provider"
                name="provider"
                defaultValue="gmail_manual"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="gmail_manual">Gmail Manual</option>
                <option value="smtp">SMTP</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit">Create Campaign</Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/campaigns">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
