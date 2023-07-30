import WebSocket from "ws";

export default class Client {
    teamId: number;
    isCaptain: boolean;
    token: string;
    socket: WebSocket;
    nickName: string;
}