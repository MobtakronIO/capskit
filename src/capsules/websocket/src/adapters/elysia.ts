import { ICapsKit, CapsuleManifest, ActionContext } from '../../../../types';
import { SocketDefinition } from '../types';
import { FrameworkError } from '../../../../kernel/errors';
import { handleWebSocketError } from '../../../../kernel/error-mapping';

export function createElysiaSocket(capskit: ICapsKit) {
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
                console.error(`[WebSocket] Error in open handler for ${socket.path}:`, error);
                // Optionally, you could close the connection or send an error message
                ws.close(1011, 'Internal server error during open');
              }
           } : undefined,
           
           message: async (ws: any, message: any) => {
              try {
                const result = await capskit.call(`${manifest.name}.${socket.message}`, { ws, body: message });
                if (result) ws.send(result);
              } catch (error: any) {
                console.error(`[WebSocket] Error in message handler for ${socket.path}:`, error);
                // Send error response to client if appropriate
                const errMsg = error instanceof FrameworkError ? error.message : 'Internal server error';
                ws.send(JSON.stringify({ error: errMsg }));
              }
           },
           
           close: socket.close ? async (ws: any, code: number, message: string) => {
              try {
                await capskit.call(`${manifest.name}.${socket.close}`, { ws, code, message });
              } catch (error: any) {
                console.error(`[WebSocket] Error in close handler for ${socket.path}:`, error);
              }
           } : undefined,
           
           drain: socket.drain ? async (ws: any) => {
              try {
                await capskit.call(`${manifest.name}.${socket.drain}`, { ws });
              } catch (error: any) {
                console.error(`[WebSocket] Error in drain handler for ${socket.path}:`, error);
              }
           } : undefined
         };
      });
    }
  });

  return sockets;
}
