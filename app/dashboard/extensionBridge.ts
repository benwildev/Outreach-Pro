"use client";

export const K_DELAY_MIN = "leadsExtensionBulkDelayMinMs";
export const K_DELAY_MAX = "leadsExtensionBulkDelayMaxMs";
export const K_LIMIT = "leadsExtensionBulkLimit";
export const K_AUTO_FOLLOWUP = "leadsExtensionBulkAutoFollowup";
export const K_WINDOW_ENABLED = "leadsExtensionBulkWindowEnabled";
export const K_WINDOW_START = "leadsExtensionBulkWindowStart";
export const K_WINDOW_END = "leadsExtensionBulkWindowEnd";
export const K_SCHEDULE_TIME = "leadsExtensionScheduleTime";

export const BRIDGE_REQUEST_TYPE = "LEADS_EXTENSION_BRIDGE_REQUEST";
export const BRIDGE_RESPONSE_TYPE = "LEADS_EXTENSION_BRIDGE_RESPONSE";
export const BRIDGE_READY_TYPE = "LEADS_EXTENSION_BRIDGE_READY";

/**
 * Sends a message to the Chrome extension via the window.postMessage bridge.
 */
export async function sendRuntimeMessage(payload: { action: string; data?: any }): Promise<any> {
    if (typeof window === "undefined") {
        throw new Error("Window is not available");
    }
    const action = String(payload.action || "").trim();
    if (!action) {
        throw new Error("Action is required");
    }
    const requestId = `bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            window.removeEventListener("message", onMessage);
            reject(new Error("Extension bridge timeout (extension might not be installed or enabled)"));
        }, 8000);

        function onMessage(event: MessageEvent) {
            if (event.source !== window) return;

            const message = event.data as {
                type?: string;
                id?: string;
                success?: boolean;
                payload?: any;
            };

            if (!message || message.type !== BRIDGE_RESPONSE_TYPE || message.id !== requestId) {
                return;
            }

            window.clearTimeout(timeout);
            window.removeEventListener("message", onMessage);

            if (!message.success) {
                reject(new Error(message.payload?.error || "Extension bridge request failed"));
                return;
            }
            resolve(message.payload ?? null);
        }

        window.addEventListener("message", onMessage);
        window.postMessage(
            {
                type: BRIDGE_REQUEST_TYPE,
                id: requestId,
                action,
                data: payload.data ?? {},
            },
            window.location.origin
        );
    });
}
