import Client from "Client";

export default class Team {
    countCardsToOpen: number = 0;
    words: Word[] = [];
    color: string = "";
    clients: Client[] = [];
    id: number = -1;
}