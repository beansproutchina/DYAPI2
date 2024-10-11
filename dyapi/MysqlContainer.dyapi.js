import { DataField, ObjectID, Container, DataType, updateEtag, logger } from "./dyapi.js";
import mysql from 'mysql2/promise';
import { SQLUtility } from "./SqlUtility.js";

export class MySQLContainer extends Container {

    #conn = null;
    numberId = true;
    database = null;
    #tables = [];
    #config = {};

    constructor({host, user, password, port = 3306, database}, numberId = true) {
        super();
        this.numberId = numberId;
        this.#config = {
            host: host,
            user: user,
            password: password,
            port: port,
            database: database
        };
    }

    async init() {
        let connection = await mysql.createConnection(this.#config);
        this.#conn = connection;
        this.database = this.#config.database;

        // Query names of tables in this database
        const [rows, _] = await this.#conn.execute({sql: "SHOW TABLES;", rowsAsArray: true});
        rows.forEach(tbl => {
            this.#tables.push(tbl[0]);
        });
    }

    /**
     * 设置字段
     * @param {string} tablename - 表名
     * @param {DataField} field - 要设置的字段
     */
    async setField(tablename, field) {
        if(this.#tables.indexOf(tablename) == -1) { // Table doesn't exist
            if(this.numberId) {
                await this.#conn.execute(`CREATE TABLE ${tablename} (id INT PRIMARY KEY AUTO_INCREMENT);`);
            }else {
                await this.#conn.execute(`CREATE TABLE ${tablename} (id TEXT PRIMARY KEY)`);
            }
            this.#tables.push(tablename);
        }
        
        let fields = (await this.#conn.execute({sql: `SHOW COLUMNS FROM ${tablename}`, rowsAsArray: true}))[0];
        let target = fields.find(x => x[0] == field.name);
        if(target == null) {
            var sql_type = "";
            switch(field.type) {
                case DataType.Number:
                    sql_type = "INT";
                    break;
                case DataType.Float:
                    sql_type = "REAL";
                    break;
                case DataType.String:
                    sql_type = "TEXT";
                    break;
                case DataType.Date:
                    sql_type = "DATETIME";
                    break;
                case DataType.Object:
                    sql_type = "TEXT"; // XXX: ??
                    break;
            }

            let defaultv = field.defaultvalue;
            if(field.type == DataType.Date) {
                if (defaultv == null) {
                    defaultv = "CURRENT_TIMESTAMP";
                } else {
                    defaultv = field.getDefaultValue();
                }
            }
            if(defaultv == null) {
                await this.#conn.execute(`ALTER TABLE ${tablename} ADD ${field.name} ${sql_type};`);
            }else {
                if(field.type == DataType.String) {
                    defaultv = `"${defaultv}"`;
                }
                await this.#conn.execute(`ALTER TABLE ${tablename} ADD ${field.name} ${sql_type} DEFAULT (${defaultv});`);
            }
            if(field.unique) {
                await this.#conn.execute(`ALTER TABLE ${tablename} ADD UNIQUE (${field.name});`);
            }
        }
    }

    /**
     * 创建一个新的记录。
     * @param {string} table - 表名
     * @param {Object} item - 要创建的项目对象
     * @returns {number|string|null} - 返回新创建项目的ID或null
     */
    async create(table, item) {
        updateEtag();
        let fields = [];
        let questions = "";
        let values = [];
        for (let field in item) {
            if (field == "id") {
                continue;
            }
            fields.push("`" + SQLUtility.AntiSqlInject(field) + "`");
            if (typeof (item[field]) === "object") {
                if (item[field] instanceof Date) {
                    values.push(item[field].getTime());
                } else {
                    values.push(JSON.stringify(item[field]));
                }
            } else {
                values.push(item[field]);
            }
            questions += "?,";
        }
        if (!this.numberId) {
            fields.push("`id`");
            questions += "?,";
            values.push(ObjectID());
        }

        let sql = `INSERT INTO ${SQLUtility.AntiSqlInject(table)} (${fields.join(",")}) VALUES (${questions.slice(0, -1)});`;
        await this.#conn.query(sql, values);
        
        sql = `SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`;
        let result = (await this.#conn.execute({sql: sql, rowsAsArray: true}))[0][0];
        return result[0]; // id
    }

    /**
     * 读取表中的记录。
     * @param {string} table - 表名
     * @param {Object} [param] - 查询参数
     * @param {string[]} [param.fields] - 需要返回的字段列表
     * @param {number|string} [param.id] - 记录ID（与filter二选一）
     * @param {Object} [param.filter] - 过滤条件（与ID二选一）
     * @param {string} [param.orderBy] - 排序字段
     * @param {boolean} [param.orderDesc] - 是否降序
     * @param {number} [param.limit] - 返回（单页）结果的个数
     * @param {number} [param.page] - 当前页数(0based)
     * @param {number} [param.offset] - 偏移量
     * @param {number} [param.total] - Out 记录总数
     * @param {number} [param.pages] - Out 总页数
     * @returns {Array} - 包含查询结果的数组
     */
    async read(table, param) {
    }

    /**
         * 更新表中的记录。
         * @param {string} table - 表名
         * @param {Object} [param] - 查询参数
         * @param {number|string} [param.id] - 记录ID（与filter二选一）
         * @param {Object} [param.filter] - 过滤条件（与ID二选一）
         * @param {string} [param.orderBy] - 排序字段
         * @param {boolean} [param.orderDesc] - 是否降序
         * @param {number} [param.limit] -  筛选（单页）结果的个数
         * @param {number} [param.page] - 当前页数
         * @param {number} [param.offset] - 偏移量
         * @param {Object|Function} item - 要更新的数据或更新逻辑函数
         * @returns {number} - 更新的记录数量
         */
    async update(table, param, item) {
    }
    /**
     * 删除表中的记录。
     * @param {string} table - 表名
     * @param {Object} [param] - 查询参数
     * @param {number|string} [param.id] - 记录ID（与filter二选一）
     * @param {Object} [param.filter] - 过滤条件（与ID二选一）
     * @param {string} [param.orderBy] - 排序字段
     * @param {boolean} [param.orderDesc] - 是否降序
     * @param {number} [param.limit] -  筛选（单页）结果的个数
     * @param {number} [param.page] - 当前页数
     * @param {number} [param.offset] - 偏移量
     * @returns {number} - 删除的记录数量
     */
    async remove(table, param) {
    }
}
