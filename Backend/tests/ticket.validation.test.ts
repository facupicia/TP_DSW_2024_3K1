import { createTicket } from "../src/ticket/ticket.controller";
import { CustomRequest } from "../src/middlewares/authToken";
import { Response } from "express";

// Mock response object
const mockRes = () => {
    const res: Partial<Response> = {};
    res.status = (code: number) => {
        res.statusCode = code;
        return res as Response;
    };
    res.json = (body: any) => {
        (res as any).body = body;
        return res as Response;
    };
    return res as Response;
};

async function testTicketValidation() {
    console.log("--- Testing Ticket Validation ---");

    // Case 1: No User ID
    let req = { body: {}, user: undefined } as unknown as CustomRequest;
    let res = mockRes();
    await createTicket(req, res);
    console.log(`No User: Status ${res.statusCode} (Expected 401)`);
    if (res.statusCode !== 401) console.error("FAIL: Expected 401");

    // Case 2: No ticketTypeId
    req = { body: { cantidad: 1 }, user: { id: 1 } } as unknown as CustomRequest;
    res = mockRes();
    await createTicket(req, res);
    console.log(`No TicketType: Status ${res.statusCode} (Expected 400) - ${(res as any).body?.message}`);
    if (res.statusCode !== 400) console.error("FAIL: Expected 400");

    // Case 3: Invalid Quantity
    req = { body: { ticketTypeId: 1, cantidad: 0 }, user: { id: 1 } } as unknown as CustomRequest;
    res = mockRes();
    await createTicket(req, res);
    console.log(`Invalid Quantity: Status ${res.statusCode} (Expected 400) - ${(res as any).body?.message}`);
    if (res.statusCode !== 400) console.error("FAIL: Expected 400");
}

async function main() {
    try {
        await testTicketValidation();
        console.log("Tests completed.");
        process.exit(0);
    } catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    }
}

main();
