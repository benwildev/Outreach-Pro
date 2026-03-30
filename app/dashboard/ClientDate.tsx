"use client";

import { useEffect, useState } from "react";

export function ClientDate({ date }: { date: Date | string | null }) {
    const [formatted, setFormatted] = useState("—");

    useEffect(() => {
        if (!date) {
            setFormatted("—");
            return;
        }
        const d = new Date(date);
        setFormatted(
            new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
            }).format(d)
        );
    }, [date]);

    return <span suppressHydrationWarning>{formatted}</span>;
}
