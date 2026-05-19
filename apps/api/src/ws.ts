import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

export function createSocketServer(httpServer: HttpServer, frontendOrigin: string) {
  return new Server(httpServer, {
    cors: {
      origin: frontendOrigin,
      methods: ['GET', 'POST'],
    },
  });
}
