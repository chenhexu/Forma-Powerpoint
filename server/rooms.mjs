import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { applyDeckPatch } from '../src/deckPatch.mjs';

export const ROOM_ENDPOINT = '/forma-rooms';
const MAX_BYTES = 96 * 1024 * 1024;
const MAX_EMPTY_AGE = 30 * 60 * 1000;
const ID = /^[a-f\d-]{36}$/i;
const CODE = /^[\w-]{32}$/;
const roomCode = () => randomBytes(24).toString('base64url');
const plain = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function assetsAreValid(assets) {
  return (
    plain(assets) &&
    Object.entries(assets).every(
      ([key, asset]) =>
        key.length < 250 &&
        !['__proto__', 'prototype', 'constructor'].includes(key) &&
        plain(asset) &&
        typeof asset.bytes === 'string' &&
        typeof asset.mime === 'string' &&
        asset.mime.length < 150,
    )
  );
}

function stateIsValid(state) {
  return (
    plain(state) &&
    typeof state.original === 'string' &&
    assetsAreValid(state.assets) &&
    plain(state.deck) &&
    typeof state.deck.name === 'string' &&
    state.deck.name.length < 1000 &&
    state.deck.width > 0 &&
    state.deck.width < 100000 &&
    state.deck.height > 0 &&
    state.deck.height < 100000 &&
    Array.isArray(state.deck.slides) &&
    state.deck.slides.length > 0 &&
    state.deck.slides.length <= 2000 &&
    state.deck.slides.every(
      (slide) =>
        plain(slide) &&
        typeof slide.id === 'string' &&
        Array.isArray(slide.objects) &&
        slide.objects.length <= 10000 &&
        slide.objects.every(
          (object) => plain(object) && typeof object.id === 'string' && typeof object.kind === 'string',
        ),
    )
  );
}

const encodedSize = (state) =>
  JSON.stringify(state.deck).length +
  state.original.length +
  Object.values(state.assets).reduce((length, asset) => length + asset.bytes.length, 0);

export function attachRooms(server) {
  const rooms = new Map();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_BYTES, perMessageDeflate: false });
  function send(socket, data) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_BYTES) return socket.terminate();
    socket.send(typeof data === 'string' ? data : JSON.stringify(data), (error) => {
      if (error) socket.terminate();
    });
  }
  function broadcast(room, event) {
    const data = JSON.stringify(event);
    for (const socket of room.members) send(socket, data);
  }
  const versions = (room) => room.checkpoints.map(({ id, name, date }) => ({ id, name, date }));
  const activeBytes = (excluding) =>
    [...rooms.values()].reduce((sum, room) => sum + (room === excluding ? 0 : room.size), 0);
  const maxTotal = MAX_BYTES * 3;
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (!room.members.size && now - room.touched > MAX_EMPTY_AGE) rooms.delete(code);
    }
    for (const socket of sockets.clients) {
      if (!socket.alive) socket.terminate();
      else {
        socket.alive = false;
        socket.ping();
      }
    }
  }, 30000);
  sweep.unref();

  server.on('upgrade', (req, stream, head) => {
    if (req.url?.split('?')[0] !== ROOM_ENDPOINT) return;
    let allowed = false;
    try {
      allowed = new URL(req.headers.origin).host === req.headers.host;
    } catch {}
    if (!allowed || sockets.clients.size >= 144) {
      stream.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      stream.destroy();
      return;
    }
    sockets.handleUpgrade(req, stream, head, (socket) => sockets.emit('connection', socket));
  });
  sockets.on('connection', (socket) => {
    let room;
    let client;
    socket.alive = true;
    socket.on('pong', () => {
      socket.alive = true;
    });
    socket.on('error', () => socket.terminate());
    const timeout = setTimeout(() => {
      if (!room) socket.close(1008);
    }, 10000);
    const fail = (message) => send(socket, { type: 'error', message });
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (!room) {
          if (!ID.test(message.client)) return socket.close(1008);
          client = message.client;
          if (message.type === 'create') {
            if (rooms.size >= 24 || activeBytes() + raw.length > maxTotal)
              return fail('The relay is full. Try again later.');
            if (!stateIsValid(message.state))
              return fail('The presentation could not be opened for sharing.');
            const code = roomCode();
            room = {
              code,
              state: message.state,
              size: raw.length,
              touched: Date.now(),
              members: new Set(),
              acks: new Map(),
              checkpoints: [],
              originalVersion: 0,
            };
            rooms.set(code, room);
          } else if (message.type === 'join') {
            room = CODE.test(message.code) ? rooms.get(message.code) : undefined;
            if (!room) return fail('That room code is invalid or has expired.');
            if (room.members.size >= 12) {
              room = undefined;
              return fail('This room is full.');
            }
          } else return socket.close(1008);
          room.members.add(socket);
          clearTimeout(timeout);
          send(socket, {
            type: 'welcome',
            code: room.code,
            state: room.state,
            ack: room.acks.get(client) ?? 0,
            originalVersion: room.originalVersion,
            versions: versions(room),
          });
          broadcast(room, { type: 'members', count: room.members.size });
          return;
        }
        room.touched = Date.now();
        if (message.type === 'edit') {
          if (!Number.isSafeInteger(message.sequence) || message.sequence < 1) return fail('Invalid edit.');
          if ((room.acks.get(client) ?? 0) >= message.sequence) {
            send(socket, {
              type: 'state',
              state: room.state,
              ack: room.acks.get(client),
              originalVersion: room.originalVersion,
              versions: versions(room),
            });
            return;
          }
          const patch = message.patch;
          if (!plain(patch) || (patch.assets && !assetsAreValid(patch.assets))) return fail('Invalid edit.');
          if (patch.original && message.originalVersion !== room.originalVersion)
            return fail(
              'Another editor changed the presentation file while this operation was running. Your local copy is still open.',
            );
          const state = {
            original: patch.original ?? room.state.original,
            assets: patch.assets ? { ...room.state.assets, ...patch.assets } : room.state.assets,
            deck: applyDeckPatch(room.state.deck, patch.deck),
          };
          if (!stateIsValid(state)) return fail('The relay could not apply an edit.');
          const size = encodedSize(state);
          if (size > MAX_BYTES || activeBytes(room) + size > maxTotal)
            return fail('This presentation exceeds the relay’s capacity.');
          room.state = state;
          room.size = size;
          room.acks.set(client, message.sequence);
          if (patch.original) room.originalVersion++;
          broadcast(room, {
            originalVersion: room.originalVersion,
            type: 'edit',
            client,
            sequence: message.sequence,
            patch,
          });
        } else if (message.type === 'checkpoint') {
          if (typeof message.name !== 'string' || !message.name.trim()) return;
          room.checkpoints.push({
            id: roomCode(),
            name: message.name.trim().slice(0, 100),
            date: Date.now(),
            deck: room.state.deck,
          });
          room.checkpoints = room.checkpoints.slice(-8);
          broadcast(room, { type: 'versions', versions: versions(room) });
        } else if (message.type === 'restore') {
          const version = room.checkpoints.find(({ id }) => id === message.id);
          if (!version) return fail('That version is unavailable.');
          room.state = { ...room.state, deck: version.deck };
          for (const peer of room.members)
            send(peer, {
              type: 'state',
              state: room.state,
              ack: room.acks.get(peer.formaClient) ?? 0,
              originalVersion: room.originalVersion,
              versions: versions(room),
            });
        }
      } catch {
        fail('The relay could not apply the request.');
      } finally {
        if (client) socket.formaClient = client;
      }
    });
    socket.on('close', () => {
      clearTimeout(timeout);
      if (!room) return;
      room.members.delete(socket);
      room.touched = Date.now();
      broadcast(room, { type: 'members', count: room.members.size });
    });
  });
  server.once('close', () => {
    clearInterval(sweep);
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
  });
}
