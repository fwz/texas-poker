import { RoomListEntry, RoomOptions } from '../../../shared/types';
import { Room } from './room';

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, string>();
  private socketToPlayer = new Map<string, string>();

  createRoom(socketId: string, playerName: string, avatar: string, options: RoomOptions): { roomCode: string; playerId: string } {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();

    const playerId = `p_${socketId.slice(0, 8)}`;
    const room = new Room(code, playerId, options);
    room.addPlayer(socketId, playerId, playerName, avatar);
    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, code);
    this.socketToPlayer.set(socketId, playerId);
    return { roomCode: code, playerId };
  }

  joinRoom(socketId: string, roomCode: string, playerName: string, avatar: string): { playerId: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) throw new Error('Room not found');

    const playerId = `p_${socketId.slice(0, 8)}`;
    room.addPlayer(socketId, playerId, playerName, avatar);
    this.socketToRoom.set(socketId, roomCode.toUpperCase());
    this.socketToPlayer.set(socketId, playerId);
    return { playerId };
  }

  getRoom(roomCode: string): Room {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found');
    return room;
  }

  getRoomCodeBySocket(socketId: string): string {
    const code = this.socketToRoom.get(socketId);
    if (!code) throw new Error('Socket not in any room');
    return code;
  }

  getPlayerIdBySocket(socketId: string): string {
    const id = this.socketToPlayer.get(socketId);
    if (!id) throw new Error('Player not found');
    return id;
  }

  listRooms(): RoomListEntry[] {
    return Array.from(this.rooms.values())
      .filter(room => !room.isEmpty() && room.players.length < room.options.maxPlayers)
      .map(room => room.getRoomInfo());
  }

  leaveRoom(socketId: string): { roomCode: string; playerId: string } | null {
    const roomCode = this.socketToRoom.get(socketId);
    const room = roomCode ? this.rooms.get(roomCode) : undefined;
    if (!room) return null;

    const playerId = room.leave(socketId);
    this.socketToRoom.delete(socketId);
    this.socketToPlayer.delete(socketId);

    if (room.isEmpty()) this.rooms.delete(roomCode!);

    return playerId ? { roomCode: roomCode!, playerId } : null;
  }

  handleDisconnect(socketId: string): { roomCode: string; playerId: string } | null {
    const roomCode = this.socketToRoom.get(socketId);
    const room = roomCode ? this.rooms.get(roomCode) : undefined;
    if (!room) return null;

    const playerId = room.handleDisconnect(socketId);
    this.socketToRoom.delete(socketId);
    this.socketToPlayer.delete(socketId);

    if (room.isEmpty()) {
      this.rooms.delete(roomCode!);
    }

    return playerId ? { roomCode: roomCode!, playerId } : null;
  }
}
