import { getCreatorStats } from '../src/event/event.controller';
import { CustomRequest } from '../src/middlewares/authToken';
import { Response } from 'express';
import { User } from '../src/user/user.entity';
import { Event } from '../src/event/event.entity';
import { Ticket } from '../src/ticket/ticket.entity';

// Simple Mocking Infrastructure
const mockUser = { id: 1, firstname: 'Test', lastname: 'User' };
const mockEvents = [
    { id: 1, capacity: 100, categoria_name: 'Music', user_id: 1 },
    { id: 2, capacity: 50, categoria_name: 'Sports', user_id: 1 }
];
const mockTicketsCount = 75;

// Override static methods
User.findOneBy = async () => mockUser as any;

// Mock QueryBuilders
const eventQB = {
    leftJoinAndSelect: function () { return this; },
    where: function () { return this; },
    getMany: async () => mockEvents
};

const ticketQB = {
    innerJoin: function () { return this; },
    where: function () { return this; },
    andWhere: function () { return this; },
    getCount: async () => mockTicketsCount
};

Event.createQueryBuilder = () => eventQB as any;
Ticket.createQueryBuilder = () => ticketQB as any;

// Mock Response
const res = {
    json: (body: any) => {
        console.log('Stats Result:', JSON.stringify(body, null, 2));

        // Assertions
        const expectedTotalEvents = 2;
        const expectedAvgParticipants = 37.5; // 75 / 2
        const expectedAttendanceRate = 0.5; // 75 / 150

        let passed = true;

        if (body.totalEventsCreated !== expectedTotalEvents) {
            console.error(`FAIL: totalEventsCreated. Expected ${expectedTotalEvents}, got ${body.totalEventsCreated}`);
            passed = false;
        }

        if (body.averageParticipantsPerEvent !== expectedAvgParticipants) {
            console.error(`FAIL: averageParticipantsPerEvent. Expected ${expectedAvgParticipants}, got ${body.averageParticipantsPerEvent}`);
            passed = false;
        }

        if (body.attendanceRate !== expectedAttendanceRate) {
            console.error(`FAIL: attendanceRate. Expected ${expectedAttendanceRate}, got ${body.attendanceRate}`);
            passed = false;
        }

        if (passed) console.log('ALL TESTS PASSED');
        return res;
    },
    status: (code: number) => {
        console.log('Status:', code);
        return res;
    }
} as any as Response;

const req = {
    user: { id: 1 },
    query: {}
} as any as CustomRequest;

async function runTests() {
    console.log('Running Stats Logic Tests...');
    try {
        await getCreatorStats(req, res);
    } catch (e) {
        console.error(e);
    }
}

runTests();
