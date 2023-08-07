import sqlite3 from "sqlite3";
import {open} from "sqlite"
import User from "database_models/User";
import Dictionary from "database_models/Dictionary";
import AutoCompleteData from "database_models/AutoCompleteData";
import * as bcrypt from 'bcryptjs';
import SQLScriptNames from "../sql/SQLScriptNames";
import * as fs from "fs";

export default class DatabaseService {
    private static databasePath: string;

    public static init(databasePath: string) {
        this.databasePath = databasePath;
        this.initDatabase().then(r => {});
    }

    public static async isExistsUsername(username: string): Promise<boolean> {
        const query = "SELECT 1 AS isExists FROM users where login = ?";
        const db = await this.openDb();
        let result = await db.get(query, username);
        return !!result;
    }

    public static async addUser(username: string, password: string): Promise<number> {
        if (!username) {
            throw new Error("Username не может быть пустым");
        }

        if (!password) {
            throw new Error("Password не может быть пустым");
        }

        const query = "INSERT INTO users VALUES(null, ?, ?)";
        const db = await this.openDb();

        const hashedPassword = await bcrypt.hash(password, 10);

        let result = await db.run(query, username, hashedPassword);

        if (!result.lastID) {
            throw new Error("Не удалось создать пользователя");
        }

        return result.lastID;
    }

    public static async authorize(username: string, password: string): Promise<User | undefined> {
        const query = "SELECT * FROM users where login = ?";
        const db = await this.openDb();
        
        const user = await db.get<User>(query, username);

        if (!user) {
            return undefined; 
        }
        
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (passwordMatch) {
            return user; 
        } else {
            return undefined; 
        }
    }

    public static async insertPacToDb(dictionaryName: string, userId: number, words: string[]) {
        if (!userId) {
            throw new Error("userId mustn't be null");
        }

        if (!dictionaryName) {
            throw new Error("Dictionary name mustn't be empty");
        }

        const query = "INSERT INTO dicts VALUES(null, ?, ?, ?, 0)";
        const db = await this.openDb();
        await db.run(query, userId, dictionaryName, JSON.stringify(words));
    }

    public static async refreshPacInDb(request: any, words: string[], response: any, id: number) {
        const query = "UPDATE dicts SET name = ?, words = ? where id = ?";
        const db = await this.openDb();
        await db.run(query, request.body.name, JSON.stringify(words), id);
    }

    public static async getPacById(id: number): Promise<Dictionary | undefined> {
        const query = "SELECT * FROM dicts where id = ?";
        const db = await this.openDb();
        return await db.get<Dictionary>(query, id);
    }


    public static async autoComplete(value: string): Promise<AutoCompleteData[] | string> {
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

    public static async getCountByUid(uid: number): Promise<number> {
        const db = await this.openDb();
        const query = "SELECT count (*) as count FROM dicts where uid = ? ";
        const result = await db.get(query, uid);
        return result.count;
    }

    public static async getDictsByUidWithPagination(uid: number, offset: number, limit: number): Promise<Dictionary[]> {
        const db = await this.openDb();
        const query = "SELECT * FROM dicts WHERE uid = ? ORDER BY id DESC LIMIT ?, ?";
        return await db.all<Dictionary[]>(query, uid, offset, limit);
    }

    private static async openDb() {
        return open({
            filename: this.databasePath,
            driver: sqlite3.Database
        });
    }

    private static async initDatabase() {
        try {
            console.log("Start initialization database");
            const db = await this.openDb();

            console.log("Start initialization users table");
            const usersMigration = fs.readFileSync(
                `./src/sql/${SQLScriptNames.INIT_USERS_TABLE}`,
                {encoding: "utf-8"},
            );
            await db.exec(usersMigration);
            console.log("End initialization users table");

            console.log("Start initialization dictionaries table");
            const dictionaryMigration = fs.readFileSync(
                `./src/sql/${SQLScriptNames.INIT_DICTS_TABLE}`,
                {encoding: "utf-8"},
            );
            await db.exec(dictionaryMigration);
            console.log("End initialization dictionaries table");

            console.log("Start initialization sessions table");
            const sessionMigration = fs.readFileSync(
                `./src/sql/${SQLScriptNames.INIT_SESSION_TABLE}`,
                {encoding: "utf-8"},
            );
            await db.exec(sessionMigration);
            console.log("End initialization sessions table");
            console.log("End initialization database");
        } catch (ex) {
            console.error(`Error occurred when database was tried to initialize: ${ex.message}`);
        }
    }
}