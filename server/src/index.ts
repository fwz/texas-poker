import cors from 'cors';
import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { Server, Socket } from 'socket.io';
import { ClientToServerEvents, RoomListEntry, ServerToClientEvents } from '../../shared/types';
import { RoomManager } from './rooms/roomManager';

const app = express();
app.use(cors());
app.use(express.json());

// Health check for Railway / uptime monitors
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const manager = new RoomManager();

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function broadcastRoomState(roomCode: string): void {
  const room = manager.getRoom(roomCode);
  for (const rp of room.players) {
    const s = io.sockets.sockets.get(rp.socketId);
    if (s) {
      s.emit('game_state_update', room.getStateFor(rp.id));
    }
  }
}

io.on('connection', (socket: AppSocket) => {
  socket.on('list_rooms', (callback) => {
    callback(manager.listRooms());
  });

  socket.on('leave_room', () => {
    const result = manager.leaveRoom(socket.id);
    if (result) {
      const { roomCode, playerId } = result;
      socket.leave(roomCode);
      io.to(roomCode).emit('player_disconnected', { playerId });
      try { broadcastRoomState(roomCode); } catch { /* room may be empty */ }
    }
  });

  socket.on('create_room', (payload, callback) => {
    try {
      const options = { ...payload.options, turnTimeLimit: payload.options.turnTimeLimit ?? 10 };
      const { roomCode, playerId } = manager.createRoom(socket.id, payload.playerName, payload.avatar ?? '🐼', options);
      socket.join(roomCode);
      const room = manager.getRoom(roomCode);
      room.onBroadcastNeeded = () => {
        try { broadcastRoomState(roomCode); } catch { /* room gone */ }
      };
      const gameState = room.getStateFor(playerId);
      callback({ roomCode, playerId, gameState });
      broadcastRoomState(roomCode);
    } catch (e: any) {
      callback({ error: e.message });
    }
  });

  socket.on('join_room', (payload, callback) => {
    try {
      const { playerId } = manager.joinRoom(socket.id, payload.roomCode, payload.playerName, payload.avatar ?? '🐼');
      const roomCode = payload.roomCode.toUpperCase();
      socket.join(roomCode);
      const room = manager.getRoom(roomCode);
      if (!room.onBroadcastNeeded) {
        room.onBroadcastNeeded = () => {
          try { broadcastRoomState(roomCode); } catch { /* room gone */ }
        };
      }
      const gameState = room.getStateFor(playerId);
      callback({ playerId, gameState });
      broadcastRoomState(roomCode);
    } catch (e: any) {
      callback({ error: e.message });
    }
  });

  socket.on('start_game', (callback) => {
    try {
      const roomCode = manager.getRoomCodeBySocket(socket.id);
      manager.getRoom(roomCode).startGame(socket.id);
      broadcastRoomState(roomCode);
      callback({ ok: true });
    } catch (e: any) {
      callback({ error: e.message });
    }
  });

  socket.on('player_action', (action, callback) => {
    try {
      const roomCode = manager.getRoomCodeBySocket(socket.id);
      manager.getRoom(roomCode).applyAction(socket.id, action);
      broadcastRoomState(roomCode);
      callback({ ok: true });
    } catch (e: any) {
      socket.emit('action_error', { message: e.message });
      callback({ error: e.message });
    }
  });

  socket.on('use_delay_card', (callback) => {
    try {
      const roomCode = manager.getRoomCodeBySocket(socket.id);
      manager.getRoom(roomCode).useDelayCard(socket.id);
      broadcastRoomState(roomCode);
      callback({ ok: true });
    } catch (e: any) {
      callback({ error: e.message });
    }
  });

  socket.on('ready', () => {
    try {
      const roomCode = manager.getRoomCodeBySocket(socket.id);
      const { eliminated } = manager.getRoom(roomCode).setReady(socket.id);
      for (const { playerId, socketId } of eliminated) {
        const s = io.sockets.sockets.get(socketId);
        if (s) s.emit('player_eliminated', { playerId });
      }
      broadcastRoomState(roomCode);
    } catch {
      // player not in room, ignore
    }
  });

  socket.on('disconnect', () => {
    const result = manager.handleDisconnect(socket.id);
    if (result) {
      const { roomCode, playerId } = result;
      io.to(roomCode).emit('player_disconnected', { playerId });
      try {
        broadcastRoomState(roomCode);
      } catch {
        // room may have been deleted
      }
    }
  });
});

// In production, serve the built React client.
// Compiled location: server/dist/server/src/index.js  →  ../../../../ = project root
const clientDist = process.env.CLIENT_DIST
  ?? path.resolve(__dirname, '../../../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (fs.existsSync(clientDist)) {
    console.log(`Client served from ${clientDist}`);
  }
});
