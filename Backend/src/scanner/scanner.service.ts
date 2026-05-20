import AppDataSource from "../db";
import { ScannerOrganizerAssignment } from "./scanner-organizer-assignment.entity";
import { User } from "../user/user.entity";
import { findRolesByNames, getRoleNames } from "../user/role.entity";
import { logger } from "../common/services/logger";
import { Ticket } from "../ticket/ticket.entity";

export interface ScannerAssignmentDto {
    id: number;
    organizerId: number;
    scannerId: number;
    isActive: boolean;
    createdAt: Date;
    scanner: {
        id: number;
        firstname: string;
        lastname: string;
        email: string;
        imgPerfil: string | null;
    };
}

export interface AssignmentResult {
    success: boolean;
    assignment: { id: number; organizerId: number; scannerId: number };
    scanner?: { id: number; firstname: string; lastname: string; email: string; imgPerfil: string | null };
    message?: string;
}

export interface ScannedTicketDto {
    id: number;
    codigo_unico: string;
    status: string;
    usedAt: Date;
    scannedById: number;
    ticketType: { id: number; name: string };
    event: { id: number; title: string; date: Date };
    user: { id: number; firstname: string; lastname: string };
}

export async function listAssignments(organizerId: number): Promise<ScannerAssignmentDto[]> {
    const assignments = await AppDataSource.getRepository(ScannerOrganizerAssignment)
        .createQueryBuilder("assignment")
        .leftJoinAndSelect("assignment.scanner", "scanner")
        .where("assignment.organizerId = :organizerId", { organizerId })
        .andWhere("assignment.isActive = true")
        .orderBy("assignment.createdAt", "DESC")
        .getMany();

    return assignments.map(assignment => ({
        id: assignment.id,
        organizerId: assignment.organizerId,
        scannerId: assignment.scannerId,
        isActive: assignment.isActive,
        createdAt: assignment.createdAt,
        scanner: {
            id: assignment.scanner.id,
            firstname: assignment.scanner.firstname,
            lastname: assignment.scanner.lastname,
            email: assignment.scanner.email,
            imgPerfil: assignment.scanner.imgPerfil
        }
    }));
}

export async function assignScanner(
    organizerId: number,
    target: { email?: string; userId?: number },
    assignedById: number
): Promise<AssignmentResult> {
    const userRepo = AppDataSource.getRepository(User);

    const scanner = target.userId
        ? await userRepo.findOne({ where: { id: target.userId, active: true }, relations: ["roles"] })
        : await userRepo.createQueryBuilder("user")
            .leftJoinAndSelect("user.roles", "role")
            .where("LOWER(user.email) = LOWER(:email)", { email: String(target.email).trim() })
            .andWhere("user.active = true")
            .getOne();

    if (!scanner) {
        return { success: false, assignment: { id: 0, organizerId: 0, scannerId: 0 }, message: "Usuario no encontrado o inactivo" };
    }

    const roleNames = getRoleNames(scanner);
    const canOpenScanner = roleNames.some(role => ["scanner", "organizer", "admin"].includes(role));
    if (!canOpenScanner) {
        const [scannerRole] = await findRolesByNames(["scanner"]);
        scanner.roles = [...(scanner.roles || []), scannerRole];
        await userRepo.save(scanner);
    }

    const assignmentRepo = AppDataSource.getRepository(ScannerOrganizerAssignment);
    const existingAssignment = await assignmentRepo.findOne({
        where: { organizerId, scannerId: scanner.id }
    });

    if (existingAssignment) {
        if (!existingAssignment.isActive) {
            existingAssignment.isActive = true;
            existingAssignment.assignedById = assignedById;
            await assignmentRepo.save(existingAssignment);
        }

        return {
            success: true,
            assignment: {
                id: existingAssignment.id,
                organizerId: existingAssignment.organizerId,
                scannerId: existingAssignment.scannerId
            }
        };
    }

    const assignment = assignmentRepo.create({
        organizerId,
        scannerId: scanner.id,
        assignedById,
        isActive: true
    });
    await assignmentRepo.save(assignment);

    return {
        success: true,
        assignment: {
            id: assignment.id,
            organizerId: assignment.organizerId,
            scannerId: assignment.scannerId
        },
        scanner: {
            id: scanner.id,
            firstname: scanner.firstname,
            lastname: scanner.lastname,
            email: scanner.email,
            imgPerfil: scanner.imgPerfil
        }
    };
}

export async function removeScanner(
    organizerId: number,
    assignmentId: number
): Promise<{ success: boolean; message?: string }> {
    const assignment = await AppDataSource.getRepository(ScannerOrganizerAssignment).findOne({
        where: { id: assignmentId, organizerId }
    });

    if (!assignment) {
        return { success: false, message: "Asignación no encontrada" };
    }

    assignment.isActive = false;
    await assignment.save();

    return { success: true, message: "Scanner desasignado del organizador" };
}

export async function getHistory(
    scannerId: number,
    limit = 20
): Promise<ScannedTicketDto[]> {
    const tickets = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder("ticket")
        .leftJoinAndSelect("ticket.ticketType", "ticketType")
        .leftJoinAndSelect("ticketType.event", "event")
        .leftJoinAndSelect("ticket.user", "user")
        .select([
            "ticket.id",
            "ticket.codigo_unico",
            "ticket.status",
            "ticket.usedAt",
            "ticket.scannedById",
            "ticketType.id",
            "ticketType.name",
            "event.id",
            "event.title",
            "event.date",
            "user.id",
            "user.firstname",
            "user.lastname"
        ])
        .where("ticket.scannedById = :scannerId", { scannerId })
        .orderBy("ticket.usedAt", "DESC")
        .take(limit)
        .getMany();

    return tickets as unknown as ScannedTicketDto[];
}
