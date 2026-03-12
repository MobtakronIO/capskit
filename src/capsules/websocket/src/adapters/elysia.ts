import { ICapsKit, CapsuleManifest, ActionContext } from '../../../../types';
import { SocketDefinition } from '../types';

export function createElysiaSocket(capskit: ICapsKit) {
  // @ts-ignore - Accessing internal manifests for registration
  const manifests: CapsuleManifest[] = (capskit as any).getManifests();
  
  const sockets: Record<string, any> = {};

  manifests.forEach(manifest => {
    if (manifest.sockets) {
      manifest.sockets.forEach((socket: SocketDefinition) => {
        sockets[socket.path] = {
          open: socket.open ? async (ws: any) => {
             await capskit.call(`${manifest.name}.${socket.open}`, { ws, body: ws.data });
          } : undefined,
          
          message: async (ws: any, message: any) => {
             const result = await capskit.call(`${manifest.name}.${socket.message}`, { ws, body: message });
             if (result) ws.send(result);
          },
          
          close: socket.close ? async (ws: any, code: number, message: string) => {
             await capskit.call(`${manifest.name}.${socket.close}`, { ws, code, message });
          } : undefined,
          
          drain: socket.drain ? async (ws: any) => {
             await capskit.call(`${manifest.name}.${socket.drain}`, { ws });
          } : undefined
        };
      });
    }
  });

  return sockets;
}
