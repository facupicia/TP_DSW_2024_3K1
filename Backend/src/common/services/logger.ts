type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, msg: string, data?: any) {
    const entry = { level, msg, time: new Date().toISOString(), ...(data || {}) };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
}

export const logger = {
    debug: (msg: string, data?: any) => log("debug", msg, data),
    info: (msg: string, data?: any) => log("info", msg, data),
    warn: (msg: string, data?: any) => log("warn", msg, data),
    error: (msg: string, data?: any) => log("error", msg, data),
};

