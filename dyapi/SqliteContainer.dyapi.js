import { DataField, ObjectID, Container, DataType, updateEtag, logger } from "./dyapi.js";
import Settings from "../config/settings.js";
import fs from "fs";
import bs from "better-sqlite3";

export class SQLiteContainer extends Container {
    #filename = "";
    numberId = true;
    #db = null;
    #tables = [];
    /**
    * 构造函数初始化SQLiteContainer实例。
    * @param {string} file - 存储数据的文件路径
    * @param {Object} [options] - 可选配置对象
    * @param {boolean} [options.numberId=true] - 是否使用数字作为ID，否则用ObjectID
    */
    constructor(file, { numberId = true } = {}) {
        super();
        this.#filename = file;
        this.numberId = numberId;
        this.#db = bs(file);
        this.#db.pragma('journal_mode = WAL');
        this.#tables = this.#db.prepare("SELECT tbl_name FROM sqlite_master WHERE type = 'table';").all();
    }
    /**
     * 设置字段
     * @param {string} tablename - 表名
     * @param {DataField} field - 要设置的字段
     */
    async setField(tablename, field) {
        if (!this.#tables.find(t => t.tbl_name == tablename)) {
            if (this.numberId) {
                this.#db.exec(`CREATE TABLE ${tablename} (id INTEGER PRIMARY KEY AUTOINCREMENT);`);
            } else {
                this.#db.exec(`CREATE TABLE ${tablename} (id TEXT PRIMARY KEY);`);
            }
            this.#tables.push({ tbl_name: tablename });
        }
        let tableinfo = this.#db.prepare(`PRAGMA table_info(${tablename})`).all();
        let fieldindb = tableinfo.find(f => f.name == field.name);
        if (!fieldindb) {
            let type = "";
            switch (field.type) {
                case DataType.Date:
                    type = "DATETIME";
                    break;
                case DataType.Number:
                    type = "INTEGER";
                    break;
                case DataType.Float:
                    type = "REAL";
                    break;
                case DataType.Object:
                    type = "STRING";
                    break;
                case DataType.String:
                    type = "TEXT";
                    break;
            }
            let defaultv = field.defaultvalue;
            if (field.type == DataType.Date) {
                if (defaultv == null) {
                    defaultv = "CURRENT_TIMESTAMP";
                } else {
                    defaultv = field.getDefaultValue();
                }
            }
            if (defaultv == null) {
                this.#db.exec(`ALTER TABLE ${tablename} ADD COLUMN ${field.name} ${type};`);
            } else {
                if (field.type == DataType.String) {
                    defaultv = `"${defaultv}"`;
                }
                this.#db.exec(`ALTER TABLE ${tablename} ADD COLUMN ${field.name} ${type} DEFAULT ${defaultv};`);
            }

        }
        return;
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
            fields.push("`" + SQLiteContainer.AntiSqlInject(field) + "`");
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

        let sql = `INSERT INTO ${SQLiteContainer.AntiSqlInject(table)} (${fields.join(",")}) VALUES (${questions.slice(0, -1)});`
        this.#db.prepare(sql).run(values);
        sql = `SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`
        return this.#db.prepare(sql).get().id;
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
        let sql = "SELECT ";
        let fields = "";
        if (param.fields) {
            fields = param.fields.join(",");
        } else {
            fields = "*";
        }
        sql += fields;
        sql += " FROM " + SQLiteContainer.AntiSqlInject(table);
        let array = [];
        sql += SQLiteContainer.genSqlSuffix(param, array);
        let num = (this.#db.prepare(`SELECT COUNT(1) FROM ${SQLiteContainer.AntiSqlInject(table)}`).get())["COUNT(1)"];
        param.total = num;
        param.pages = Math.ceil(num / param.limit);
        return this.#db.prepare(sql).all(array);
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
        updateEtag();
        param.field = null;
        let sql= "UPDATE " + SQLiteContainer.AntiSqlInject(table) + " SET ";
        let array=[];
        if(typeof item=="function"){
            logger.warn("不支持在SQLite中以函数作为更新方式。");
            return 0;
        }
        for(let k in item){
            sql += `${SQLiteContainer.AntiSqlInject(k)} = ?,`;
            if (typeof (item[k]) === "object") {
                if (item[k] instanceof Date) {
                    array.push(item[k].getTime());
                } else {
                    array.push(JSON.stringify(item[k]));
                }
            } else {
                array.push(item[k]);
            }
        }
        sql = sql.slice(0, -1);
        sql += SQLiteContainer.genSqlSuffix(param, array);

        return this.#db.prepare(sql).run(array).changes;

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
        updateEtag();
        let sql = "DELETE FROM " + SQLiteContainer.AntiSqlInject(table);
        let array = [];
        sql += SQLiteContainer.genSqlSuffix(param, array);
        this.#db.prepare(sql).run(array);
        return;
    }


    static filterToSQL(key, filter, array) {
        if (key == null) {
            let r = [];
            for (let k in filter) {
                if (k.startsWith("$and")) {
                    r.push("(" + Object.entries(filter[k]).map(f => {
                        let a = [];
                        a[f[0]] = f[1];
                        return SQLiteContainer.filterToSQL(null, a, array)
                    }).join(" AND ") + ")");
                }
                else if (k.startsWith("$or")) {
                    r.push("(" + Object.entries(filter[k]).map(f => {
                        let a = [];
                        a[f[0]] = f[1];
                        return SQLiteContainer.filterToSQL(null, a, array)
                    }).join(" OR ") + ")");
                }
                else if (k.startsWith("$not")) {
                    r.push("(NOT (" + SQLiteContainer.filterToSQL(null, filter[k], array) + "))");
                }
                else {
                    if (k.startsWith("$")) {
                        logger.error(`不支持的过滤器类型${k}。`);
                        continue;
                    } else {
                        r.push(SQLiteContainer.filterToSQL(k, filter[k], array))
                    }
                }
            }
            return r.join(" AND ");
        }
        else {
            key = SQLiteContainer.AntiSqlInject(key);
            if (typeof filter == "object") {
                if (filter instanceof RegExp) {
                    array.push(filter.source);
                    return `(${key} REGEXP ?)`;
                } else if (filter instanceof Date) {
                    return `${key} = ${filter.getTime()}`;
                } else {
                    let r = [];
                    for (let k in filter) {
                        if (k.startsWith("$")) {
                            if (k.startsWith("$or")) {
                                r.push("(" + Object.entries(filter[k]).map(f => {
                                    let a = [];
                                    a[f[0]] = f[1];
                                    return SQLiteContainer.filterToSQL(key, a, array)
                                }).join(" OR ") + ")")
                            }
                            else if (k.startsWith("$and")) {
                                r.push("(" + Object.entries(filter[k]).map(f => {
                                    let a = [];
                                    a[f[0]] = f[1];
                                    return SQLiteContainer.filterToSQL(key, a, array)
                                }).join(" AND ") + ")")
                            } else if (k.startsWith("$not")) {
                                r.push("(NOT " + SQLiteContainer.filterToSQL(key, filter[k], array) + ")");
                            } else if (k == "$eq") {
                                r.push(`\`${key}\` = ?`);
                                array.push(filter[k]);
                            }
                            else if (k == "$ne") {
                                r.push(`\`${key}\` != ?`);
                                array.push(filter[k]);
                            } else if (k == "$gt") {
                                r.push(`\`${key}\` > ?`);
                                array.push(filter[k]);
                            } else if (k == "$gte") {
                                r.push(`\`${key}\` >= ?`);
                                array.push(filter[k]);
                            } else if (k == "$lt") {
                                r.push(`\`${key}\` < ?`);
                                array.push(filter[k]);
                            }
                            else if (k == "$lte") {
                                r.push(`\`${key}\` <= ?`);
                                array.push(filter[k]);
                            }
                            else if (k.startsWith("in")) {
                                r.push(`\`${key}\` IN ?`);
                                array.push("(" + filter[k].map(x => `\`${x}\``).concat(",") + ")");
                            }
                            else if (k.startsWith("$nin")) {
                                r.push(`\`${key}\` NOT IN ?`);
                                array.push("(" + filter[k].map(x => `\`${x}\``).concat(",") + ")");
                            }
                            else if (k.startsWith("$contains")) {
                                r.push(`\`${key}\` LIKE ?`);
                                array.push(`%${filter[k]}%`);
                            }
                            else if (k.startsWith("$ncontains")) {
                                r.push(`\`${key}\` NOT LIKE ?`);
                                array.push(`%${filter[k]}%`);
                            }
                            else if (k.startsWith("$start")) {
                                r.push(`\`${key}\` LIKE ?`);
                                array.push(`${filter[k]}%`);
                            }
                            else if (k.startsWith("$end")) {
                                r.push(`\`${key}\` LIKE ?`);
                                array.push(`%${filter[k]}`);
                            }
                            else if (i.startsWith("$regex")) {
                                r.push(`\`${key}\` REGEXP ?`);
                                array.push(filter.source);
                            }
                        }
                    }
                    return "(" + r.join(" AND ") + ")";
                }
            } else {
                array.push(filter);
                return `\`${key}\` = ?`;
            }
        }
    }

    static genSqlSuffix(param, array) {
        let sql = "";
        if (param.id) {
            sql += ` WHERE \`id\`=?`;
            array.push(param.id);
        } else if (param.filter) {
            sql += " WHERE " + SQLiteContainer.filterToSQL(null, param.filter, array);
        }
        if (param.orderBy) {
            sql += ` ORDER BY \`${SQLiteContainer.AntiSqlInject(param.orderBy)}\``;
            if (param.orderDesc) {
                sql += " DESC";
            }
        }
        let offset = 1 * (param.offset || 0) + 1 * param.page * param.limit;

        if (param.limit && !isNaN(param.limit)) {
            sql += ` LIMIT ${param.limit}`;
        }
        if (offset) {
            sql += ` OFFSET ${offset}`;
        }
        return sql;
    }

    static AntiSqlInject(str) {
        return str.replace(/[`'"\\]/g, "");
    }
}