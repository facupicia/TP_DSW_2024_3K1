import { checkAuthToken, CustomRequest } from '../src/middlewares/authToken';
import { checkRoleAuth } from '../src/middlewares/checkRole';
import { Response, NextFunction } from 'express';
import { tokenSing } from '../src/lib/generateToken';
import { User } from '../src/user/user.entity';

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

async function testBearerHeader() {
  process.env.SECRET_KEY = process.env.SECRET_KEY || "test_secret_key";
  const user = new User();
  user.id = 9999;
  user.rol = "admin";
  const token = await tokenSing(user);
  const req = {
    header: (name: string) => (name === "Authorization" ? `Bearer ${token}` : undefined),
  } as any as CustomRequest;
  const res = mockRes();
  const next: NextFunction = () => { (res as any).passed = true; };
  await checkAuthToken(req, res, next);
  console.log('AUTH_BEARER', res.statusCode ?? 200, (res as any).passed);
}

async function testCheckRoleReadsReqUser() {
  const req = { user: { id: 1, iat: Date.now() } } as any as CustomRequest;
  const res = mockRes();
  const next: NextFunction = () => { (res as any).passed = true; };
  await checkRoleAuth(["admin"])(req, res, next);
  console.log('ROLE_MIDDLEWARE', res.statusCode ?? 200);
}

async function main() {
  await testBearerHeader();
  await testCheckRoleReadsReqUser();
}

main().catch(err => {
  console.error('TEST_RUN_ERROR', err);
  process.exit(1);
});
