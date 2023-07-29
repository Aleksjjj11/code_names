import sqlite3 from "sqlite3";
import {open} from "sqlite"
import User from "database_models/User";
import Dictionary from "database_models/Dictionary";
import AutoCompleteData from "database_models/AutoCompleteData";

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
        await db.run(query, request.session.uid, request.body.name, JSON.stringify(words));
    }

    public async refreshPacInDb(request: any, words: string[], response: any, id: number) {
        const query = "UPDATE dicts SET name = ?, words = ? where id = ?";
        const db = await this.openDb();
        await db.run(query, request.body.name, JSON.stringify(words), id);
    }

    public async getPacById(id: string): Promise<Dictionary | undefined> {
        const query = "SELECT * FROM dicts where id = ?";
        const db = await this.openDb();
        return await db.get<Dictionary>(query, id);
    }


    public async autoComplete(value: string): Promise<AutoCompleteData[] | string> {
        const partAuto = "%" + value + "%";
        const query = "SELECT id , name FROM dicts WHERE name LIKE ? ORDER BY name LIMIT 10";
        const db = await this.openDb();
        const results = await db.all<AutoCompleteData[]>(query, partAuto);

        if (results.length > 0) {
            return results;
        } else {
            return "/0";
        }
    }

    public async getCountByUid(uid: number): Promise<number> {
        const db = await this.openDb();
        const query = "SELECT count (*) as count FROM dicts where uid = ? ";
        const result = await db.get(query, uid);
        return result.count;
    }

    public async getDictsByUidWithPagination(uid: number, offset: number, limit: number): Promise<Dictionary[]> {
        const db = await this.openDb();
        const query = "SELECT * FROM dicts WHERE uid = ? ORDER BY id DESC LIMIT ?, ?";
        return await db.all<Dictionary[]>(query, uid, offset, limit);
    }

    private async openDb () {
        return open({
            filename: this.databasePath,
            driver: sqlite3.Database
        })
    }
}