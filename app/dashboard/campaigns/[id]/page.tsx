import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCampaign } from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  return (
    <main className="container mx-auto max-w-2xl py-10">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/campaigns">← Back to campaigns</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Edit Campaign: {campaign.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateCampaign.bind(null, id)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={campaign.name}
                required
                placeholder="Campaign name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                name="subject"
                defaultValue={campaign.subject}
                required
                placeholder="Email subject"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chatGptChatId">ChatGPT Chat ID or URL (optional)</Label>
              <Input
                id="chatGptChatId"
                name="chatGptChatId"
                defaultValue={campaign.chatGptChatId ?? ""}
                placeholder="e.g. c69a83496... or https://chatgpt.com/g/.../project"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gmailAuthUser">Gmail Auth User (optional)</Label>
              <Input
                id="gmailAuthUser"
                name="gmailAuthUser"
                defaultValue={campaign.gmailAuthUser ?? ""}
                placeholder="e.g. 0, 1, 2 (or full Gmail URL with /mail/u/{authuser})"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Email Body</Label>
              <Textarea
                id="body"
                name="body"
                defaultValue={campaign.body}
                required
                rows={6}
                placeholder="Email body"
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="followup1">Follow-up 1 Body (optional)</Label>
              <Textarea
                id="followup1"
                name="followup1"
                defaultValue={campaign.followup1 ?? ""}
                rows={4}
                placeholder="First follow-up message"
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="followup2">Follow-up 2 Body (optional)</Label>
              <Textarea
                id="followup2"
                name="followup2"
                defaultValue={campaign.followup2 ?? ""}
                rows={4}
                placeholder="Second follow-up message"
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signature">Signature (optional)</Label>
              <Textarea
                id="signature"
                name="signature"
                defaultValue={campaign.signature ?? ""}
                rows={4}
                placeholder="Signature to append at the bottom of the email"
                className="resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="delay1Days">Delay 1 (days, 0 = due immediately for testing)</Label>
                <Input
                  id="delay1Days"
                  name="delay1Days"
                  type="number"
                  min={0}
                  defaultValue={campaign.delay1Days}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delay2Days">Delay 2 (days, 0 = due immediately for testing)</Label>
                <Input
                  id="delay2Days"
                  name="delay2Days"
                  type="number"
                  min={0}
                  defaultValue={campaign.delay2Days}
                  required
                />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit">Save</Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/campaigns">Back to campaigns</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
