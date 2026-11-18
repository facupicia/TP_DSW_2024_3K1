import '@angular/compiler';
import express from 'express';
import { createWebRequestFromNodeRequest, writeResponseToNodeResponse } from '@angular/ssr/node';
import { fileURLToPath } from 'node:url';
import { netlifyAppEngineHandler } from '../dist/frontend/server/server.mjs';

const server = express();
server.use(express.static(fileURLToPath(new URL('../dist/frontend/browser', import.meta.url)), { index: false, redirect: false }));
server.use(async (req, res, next) => {
  try {
    const response = await netlifyAppEngineHandler(createWebRequestFromNodeRequest(req));
    await writeResponseToNodeResponse(response, res);
  } catch (error) { next(error); }
});
const port = Number(process.env.PORT || 4000);
server.listen(port, '127.0.0.1', () => console.log(`EventLife SSR: http://localhost:${port}`));
