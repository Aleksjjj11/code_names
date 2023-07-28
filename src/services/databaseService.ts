import sqlite3 from "sqlite3";
import {open} from "sqlite"
import User from "database_models/User";

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

    private async openDb () {
        return open({
            filename: this.databasePath,
            driver: sqlite3.Database
        })
    }
}