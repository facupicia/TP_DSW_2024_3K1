import { Router, Request, Response, NextFunction } from "express";
import userRouter from "../src/routers/user.routes";

function findRoute(method: string, path: string) {
    const r = (userRouter as any).stack?.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
    return r?.route;
}

function run() {
    const getProtected = !!findRoute("get", "/:id")?.stack?.some((m: any) => m.name?.includes("checkAuthToken"));
    const delProtected = !!findRoute("delete", "/:id")?.stack?.some((m: any) => m.name?.includes("checkAuthToken"));
    console.log("USER_GET_PROTECTED", getProtected);
    console.log("USER_DELETE_PROTECTED", delProtected);
}

run();

