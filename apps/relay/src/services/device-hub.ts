import type { RelayEnvelope } from '@pigeonclaw/shared';
import type WebSocket from 'ws';

export class DeviceHub {
  private readonly sockets = new Map<string, Set<WebSocket>>();

  register(deviceId: string, socket: WebSocket) {
    const set = this.sockets.get(deviceId) ?? new Set<WebSocket>();
    set.add(socket);
    this.sockets.set(deviceId, set);
  }

  unregister(deviceId: string, socket: WebSocket) {
    const set = this.sockets.get(deviceId);
    if (!set) {
      return;
    }

    set.delete(socket);
    if (set.size === 0) {
      this.sockets.delete(deviceId);
    }
  }

  isConnected(deviceId: string) {
    return this.sockets.has(deviceId);
  }

  send(deviceId: string, envelope: RelayEnvelope) {
    const sockets = this.sockets.get(deviceId);
    if (!sockets) {
      return false;
    }

    const payload = JSON.stringify(envelope);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }

    return true;
  }
}
