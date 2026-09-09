import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';

// Dev: connect to separate Vite dev server's backend (localhost:3001).
// Prod: connect to the same origin (Express serves both static files and socket.io).
const SERVER_URL = import.meta.env.VITE_SERVER_URL
  ?? (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: false });
  }
  return socket;
}

export function resetSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K]
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const s = getSocket();
    const wrapper = (...args: any[]) => (handlerRef.current as any)(...args);
    s.on(event as any, wrapper);
    return () => { s.off(event as any, wrapper); };
  }, [event]);
}
