import type { Server } from 'node:http';
import type { Http2SecureServer } from 'node:http2';
export const ROOM_ENDPOINT: string;
export function attachRooms(server: Server | Http2SecureServer): void;
