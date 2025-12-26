import { Request, Response } from "express";
import { validateSignature } from "../src/payment/validateSignature";
import { createHmac } from "crypto";

function mockReq(body: Buffer, signature: string) {
    const req: any = {
        header: (name: string) => (name === "x-signature" ? signature : undefined),
        body
    };
    return req as Request;
}
function mockRes() {
    const res: any = {};
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (body: any) => { res.body = body; return res; };
    return res as Response & { statusCode?: number; body?: any };
}

async function run() {
    process.env.MP_WEBHOOK_SECRET = "secret";
    const payload = Buffer.from(JSON.stringify({ type: "payment", data: { id: "X" } }), "utf8");
    const goodSig = "sha256=" + createHmac("sha256", process.env.MP_WEBHOOK_SECRET!).update(payload).digest("hex");
    const reqOk = mockReq(payload, goodSig);
    const resOk = mockRes();
    await new Promise<void>(resolve => validateSignature(reqOk, resOk, () => resolve()));
    console.log("SIGNATURE_OK", (reqOk as any).parsedBody?.data?.id === "X");

    const badSig = "sha256=deadbeef";
    const reqBad = mockReq(payload, badSig);
    const resBad = mockRes();
    await validateSignature(reqBad, resBad, () => { });
    console.log("SIGNATURE_BAD", resBad.statusCode, resBad.body?.code);
}

run().catch(err => { console.error(err); process.exit(1); });

