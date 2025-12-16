import { Response } from "express";
import { CustomRequest } from "../src/middlewares/authToken";
import { updateUserRole } from "../src/user/user.controller";
import AppDataSource from "../src/db";
import { User } from "../src/user/user.entity";

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

async function setupUser(rol: string) {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const u = new User();
  u.firstname = "Test";
  u.lastname = "User";
  u.email = `test${Date.now()}@example.com`;
  u.password = "x";
  u.phone = "+0000";
  u.location = "x";
  u.birth = new Date();
  u.rol = rol;
  await u.save();
  return u;
}

async function testAdminUpdatesRole() {
  const u = await setupUser("user");
  const req = {
    params: { id: String(u.id) },
    body: { rol: "scanner" },
    user: { id: 5000, iat: Date.now() },
    ip: "127.0.0.1",
  } as any as CustomRequest;
  const res = mockRes();
  await updateUserRole(req, res);
  console.log("ROLE_UPDATE", res.statusCode, res.body);
}

async function main() {
  await testAdminUpdatesRole();
}

main().catch(err => {
  console.error('TEST_RUN_ERROR', err);
  process.exit(1);
});
