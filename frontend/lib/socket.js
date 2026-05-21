// lib/socket.js
// Satu instance Socket.IO untuk seluruh aplikasi

import { io } from 'socket.io-client';

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL, {
      autoConnect: false,
    });
  }
  return socket;
};
