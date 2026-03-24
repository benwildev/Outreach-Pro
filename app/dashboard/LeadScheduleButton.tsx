"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sendLead } from "./sendActions";
import { CalendarClock, Loader2 } from "lucide-react";
import { sendRuntimeMessage } from "./extensionBridge";

interface LeadScheduleButtonProps {
    leadId: string;
    status: string;
}

export function LeadScheduleButton({ leadId, status }: LeadScheduleButtonProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [scheduleTime, setScheduleTime] = useState("");

    const isSent = status.toLowerCase() === "sent";
    if (isSent) return null;

    async function handleSchedule() {
        if (!scheduleTime) {
            alert("Please select a time to schedule.");
            return;
        }
        setLoading(true);
        try {
            const result = await sendLead(leadId, scheduleTime);
            if (result.success) {
                if (result.type === "redirect") {
                    // Opening Gmail to schedule
                    window.open(result.url, "_blank");
                } else if (result.type === "extension_workflow") {
                    try {
                        console.log("React LeadScheduleButton -> sending data to extension:", result.data);
                        await sendRuntimeMessage({ action: "startWorkflow", data: result.data });
                    } catch (e) {
                        console.error(e);
                        alert("Extension failed: " + (e instanceof Error ? e.message : "Unknown error"));
                    }
                }
                setShowPicker(false);
                router.refresh();
            } else {
                alert(result.error || "Failed to schedule email.");
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
            <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 bg-yellow-50 hover:bg-yellow-100 border-yellow-200"
                onClick={() => {
                    if (!scheduleTime) {
                        const now = new Date();
                        const hours = String(now.getHours()).padStart(2, "0");
                        const minutes = String(now.getMinutes()).padStart(2, "0");
                        setScheduleTime(`${hours}:${minutes}`);
                    }
                    setShowPicker(!showPicker);
                }}
                disabled={loading}
                title="Schedule individual send"
            >
                <CalendarClock className="h-4 w-4 text-yellow-700" />
            </Button>

            {showPicker && (
                <div
                    className="absolute bottom-full right-0 mb-2 z-[100] bg-white border border-slate-200 shadow-2xl rounded-lg p-3 min-w-[200px]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="text-[11px] font-bold text-slate-700 mb-2">Schedule Specific Time</div>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500">Pick Time:</span>
                            <input
                                type="time"
                                value={scheduleTime}
                                onChange={(e) => setScheduleTime(e.target.value)}
                                className="h-9 rounded border border-slate-300 px-2 text-sm w-full bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                className="h-8 text-xs flex-1 bg-blue-600 hover:bg-blue-700"
                                onClick={handleSchedule}
                                disabled={loading || !scheduleTime}
                            >
                                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs flex-1"
                                onClick={() => setShowPicker(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
