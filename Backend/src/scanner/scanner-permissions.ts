import AppDataSource from "../db";
import { ScannerOrganizerAssignment } from "./scanner-organizer-assignment.entity";

export async function canValidateEvent(userId: number, roles: string[], _eventId: number, eventOwnerId: number) {
    if (roles.includes("admin") || eventOwnerId === userId) return true;
    if (!roles.includes("scanner")) return false;

    const scannerAssignmentCount = await AppDataSource.getRepository(ScannerOrganizerAssignment)
        .createQueryBuilder("assignment")
        .where("assignment.organizerId = :organizerId", { organizerId: eventOwnerId })
        .andWhere("assignment.scannerId = :userId", { userId })
        .andWhere("assignment.isActive = true")
        .getCount();

    return scannerAssignmentCount > 0;
}
