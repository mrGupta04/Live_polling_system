import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "../config";

export function useSocket() {
  const socket = useMemo<Socket>(() => io(SOCKET_URL, { autoConnect: true }), []);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, [socket]);

  return { socket, connected };
}
