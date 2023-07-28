import sqlite3 from "sqlite3";
import {open} from "sqlite"
import User from "database_models/User";
import { escape } from 'querystring';

export default class DatabaseService {
    private readonly databasePath: string;

    public constructor(databasePath: string) {
        this.databasePath = databasePath;
    }

    public async isExistsUsername(username: string): Promise<boolean> {
        const query = "SELECT 1 AS isExists FROM users where login = ?";
        const db = await this.openDb();
        let result = await db.get(query, username);
        return !!result;
    }
    
    public async addUser(username: string, password: string): Promise<number> {
        const query = "INSERT INTO users VALUES(null, ?, ?, 0)";
        const db = await this.openDb();
        let result = await db.run(query, username, password);
        return result.lastID ?? 0;
    }
    
    public async authorize(username: string, password: string): Promise<User | undefined> {
        const query = "SELECT * FROM users where login = ? and password = ? ";
        const db = await this.openDb();
        return await db.get<User>(query, username, password);
    }

    public async insertPacToDb(request: any, words: string[], response: any) {
        const query = "INSERT INTO dicts VALUES(null, ?, ?, ?, 0)";
        const db = await this.openDb();
        await db.run(query, request.session.uid, request.body.name, encodeURIComponent(JSON.stringify(words)));
        response.send({type: 'redirect', url: '/lc/1'});
    }

    public async refreshPacInDb(request: any, words: string[], response: any, id: number) {
        const query = "UPDATE dicts SET name = ?, words = ? where id = ?";
        const db = await this.openDb();
        await db.run(query, request.body.name, encodeURIComponent(JSON.stringify(words)), id);
        response.send({text: "Ваш пак обновлён!"});
    }
    public async getPacById(id: string): Promise<any> {
        const query = "SELECT * FROM dicts where id = ?";
        const db = await this.openDb();
        return await db.get(query, id);
    }
    private async openDb () {
        return open({
            filename: this.databasePath,
            driver: sqlite3.Database
        })
    }
}