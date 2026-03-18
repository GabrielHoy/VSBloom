import { WebSocket } from "ws";

export type SocketServerLike = WebSocket | PseudoSocketServer;

export class PseudoSocketServer {

}