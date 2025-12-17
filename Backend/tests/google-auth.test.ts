import { googleSignin } from "../src/user/user.controller";
import { Request, Response } from "express";

function mockRes() {
    const res: Partial<Response> & { statusCode?: number; body?: any } = {};
    res.status = (code: number) => {
        res.statusCode = code;
        return res as Response;
    };
    res.json = (body: any) => {
        res.body = body;
        return res as Response;
    };
    return res as Response & { statusCode?: number; body?: any };
}

async function testMissingCredential() {
    process.env.ID_CLIENT_GOOGLE_OAUTH = process.env.ID_CLIENT_GOOGLE_OAUTH || "dummy-client-id";
    const req = { body: {} } as any as Request;
    const res = mockRes();
    await googleSignin(req, res);
    console.log("GOOGLE_MISSING_CRED", res.statusCode, res.body?.code);
}

async function testInvalidConfig() {
    const prev = process.env.ID_CLIENT_GOOGLE_OAUTH;
    delete process.env.ID_CLIENT_GOOGLE_OAUTH;
    const req = { body: { credential: "x" } } as any as Request;
    const res = mockRes();
    await googleSignin(req, res);
    console.log("GOOGLE_NO_CONFIG", res.statusCode, res.body?.code);
    process.env.ID_CLIENT_GOOGLE_OAUTH = prev;
}

async function main() {
    await testMissingCredential();
    await testInvalidConfig();
}

main().catch(err => {
    console.error("GOOGLE_AUTH_TEST_ERROR", err);
    process.exit(1);
});
