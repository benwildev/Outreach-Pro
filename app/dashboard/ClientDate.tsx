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
                dateStyle: "short",
                timeStyle: "short",
            }).format(d)
        );
    }, [date]);

    return <span suppressHydrationWarning>{formatted}</span>;
}
