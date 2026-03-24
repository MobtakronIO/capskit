import { ICapsKit, CapsuleManifest, SocketDefinition, FrameworkError, handleWebSocketError, WebSocketAdapterOptions } from '@mobtakronio/capskit';

export function createSocket(capskit: ICapsKit, options: WebSocketAdapterOptions = {}) {
  const manifests: CapsuleManifest[] = capskit.getManifests();
  
  const sockets: Record<string, any> = {};

  manifests.forEach(manifest => {
    if (manifest.sockets) {
      manifest.sockets.forEach((socket: SocketDefinition) => {
         sockets[socket.path] = {
           open: socket.open ? async (ws: any) => {
              try {
                await capskit.call(`${manifest.name}.${socket.open}`, { ws, body: ws.data });
              } catch (error: any) {
                handleWebSocketError(error, ws, 'open');
              }
           } : undefined,
           
           message: async (ws: any, message: any) => {
              try {
                const result = await capskit.call(`${manifest.name}.${socket.message}`, { ws, body: message });
                if (result) ws.send(result);
              } catch (error: any) {
                handleWebSocketError(error, ws, 'message');
              }
           },
           
           close: socket.close ? async (ws: any, code: number, message: string) => {
              try {
                await capskit.call(`${manifest.name}.${socket.close}`, { ws, code, message });
              } catch (error: any) {
                handleWebSocketError(error, ws, 'close');
              }
           } : undefined,
           
           drain: socket.drain ? async (ws: any) => {
              try {
                await capskit.call(`${manifest.name}.${socket.drain}`, { ws });
              } catch (error: any) {
                handleWebSocketError(error, ws, 'drain');
              }
           } : undefined
         };
      });
    }
  });

  return sockets;
}

export default createSocket;
