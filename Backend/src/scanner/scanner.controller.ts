import { Request, Response } from "express";
import { Ticket, TicketStatus } from "../ticket/ticket.entity";
import { CustomRequest } from "../middlewares/authToken";

export class ScannerController {

    static async validateTicket(req: CustomRequest, res: Response) {
        try {
            const { code } = req.body;
            // @ts-ignore
            const scannerId = req.user.id;

            if (!code) {
                return res.status(400).json({ message: "Code is required" });
            }

            const ticket = await Ticket.findOne({
                where: { codigo_unico: code },
                relations: ["user", "event"]
            });

            if (!ticket) {
                return res.status(404).json({ message: "Ticket not found" });
            }

            if (ticket.status === TicketStatus.USED) {
                return res.status(409).json({
                    message: "Ticket already used",
                    ticket: {
                        ...ticket,
                        usedAt: ticket.usedAt
                    }
                });
            }

            if (ticket.status === TicketStatus.CANCELLED) {
                return res.status(409).json({ message: "Ticket is cancelled" });
            }

            // Mark as used
            ticket.status = TicketStatus.USED;
            ticket.usedAt = new Date();
            ticket.scannedById = scannerId;
            await ticket.save();

            return res.json({
                message: "Ticket validated successfully",
                ticket
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    static async getHistory(req: CustomRequest, res: Response) {
        try {
            // @ts-ignore
            const scannerId = req.user.id;

            const tickets = await Ticket.find({
                where: { scannedById: scannerId },
                relations: ["event", "user"],
                order: { usedAt: "DESC" },
                take: 50
            });

            return res.json(tickets);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    }
}
