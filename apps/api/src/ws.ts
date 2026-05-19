import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

export function createSocketServer(httpServer: HttpServer, frontendOrigins: string[]) {
  return new Server(httpServer, {
    cors: {
      origin: frontendOrigins,
      methods: ['GET', 'POST'],
    },
  });
}
