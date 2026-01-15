export function httpError(status: number, code: string, message: string) {
    const err: any = new Error(message);
    err.status = status;
    err.code = code;
    return err;
}

