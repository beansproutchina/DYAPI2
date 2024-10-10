import { DataField, ObjectID, Container, DataType, Configs, updateEtag, logger, ClientError } from "./dyapi.js";
import Settings from "../config/settings.js";
import fs from "fs";

export class JsonContainer extends Container {
    #filename = "";
    #data = {};
    #primaryKey = {};
    numberId = true;
    /**
     * 递归地检查是否obj[key]符合类MongoDB过滤器条件。
     * @param {object} obj 
     * @param {string} key 
     * @param {any} filter 
     */
    static checkFilter(obj, key, filter) {
        if (key == null) {
            for (let k in filter) {
                if (k.startsWith("$and")) {
                    for (let filterItem in filter[k]) {
                        let filter1 = {};
                        filter1[filterItem] = filter[k][filterItem];
                        if (!JsonContainer.checkFilter(obj, null, filter1)) {
                            return false;
                        }
                    }
                }
                else if (k.startsWith("$or")) {
                    let result = false;
                    for (let filterItem in filter[k]) {
                        let filter1 = {};
                        filter1[filterItem] = filter[k][filterItem];
                        if (JsonContainer.checkFilter(obj, null, filter1)) {
                            result = true;
                            break;
                        }
                    }
                    if (result == false) {
                        return false;
                    }
                }
                else if (k.startsWith("$not")) {
                    return !JsonContainer.checkFilter(obj, null, filter[k]);
                }
                else {
                    if (k.startsWith("$")) {
                        throw new ClientError(400, `不支持的过滤器类型${k}`);
                        continue;
                    } else {
                        if (!JsonContainer.checkFilter(obj, k, filter[k])) {
                            return false;
                        }
                    }
                }
            }
            return true;
        }
        else {
            let item = obj[key];
            if (typeof filter == "object") {
                if (filter instanceof RegExp) {
                    return filter.test(item);
                } else if (filter instanceof Date) {
                    return filter.getTime() == item.getTime();
                } else {
                    for (let i in filter) {
                        if (i.startsWith("$")) {
                            if (i.startsWith("$or")) {
                                let or = filter[i];
                                let result = false;
                                for (let j in or) {
                                    let ob = {};
                                    ob[j] = or[j];
                                    if (JsonContainer.checkFilter(obj, key, ob)) {
                                        result = true;
                                        break;
                                    };
                                }
                                if (!result) { return false; }
                            }
                            if (i.startsWith("$and")) {
                                let and = filter[i];
                                return JsonContainer.checkFilter(obj, key, and)
                            }
                            if (i.startsWith("$not")) {
                                if (JsonContainer.checkFilter(obj, key, filter[i])) return false;
                            }
                            if (i.startsWith("$eq") && !(item == filter[i])) return false;
                            if (i.startsWith("$ne") && !(item != filter[i])) return false;
                            if (i.startsWith("$gte")) {
                                if (!(item >= filter[i])) return false;
                            } else {
                                if (i.startsWith("$gt") && !(item > filter[i])) return false;
                            }
                            if (i.startsWith("$lte")) {
                                if (!(item <= filter[i])) return false;
                            } else {
                                if (i.startsWith("$lt") && !(item < filter[i])) return false;
                            }
                            if (i.startsWith("$in") && !(filter[i].includes(item))) return false;
                            if (i.startsWith("$nin") && !(!filter[i].includes(item))) return false;
                            if (i.startsWith("$contains") && !(item.includes(filter[i]))) return false;
                            if (i.startsWith("$ncontains") && !(!item.includes(filter[i]))) return false;
                            if (i.startsWith("$start") && !(item.startsWith(filter[i]))) return false;
                            if (i.startsWith("$end") && !(item.endsWith(filter[i]))) return false;
                            if (i.startsWith("$regex")) {
                                let regex = new RegExp(filter[i]);
                                if (!regex.test(item)) return false;
                            }
                        }
                    }
                    return true;
                }
            } else {
                return item == filter;
            }
        }
    }
    /**
    * 构造函数初始化JsonContainer实例。
    * @param {string} file - 存储数据的文件路径
    * @param {Object} [options] - 可选配置对象
    * @param {boolean} [options.numberId=true] - 是否使用数字作为ID，否则用ObjectID
    */
    constructor(file, { numberId = true } = {}) {
        super();
        this.#filename = file;
        if (fs.existsSync(this.#filename)) {
            try {
                this.#data = JSON.parse(fs.readFileSync(this.#filename, 'utf8'));
            } catch {
            }
        } else {
            logger.info("模型存储文件不存在，将自动创建。");
        }
        setInterval(() => {
            this.save();
        }, Settings.saveInterval);
        this.numberId = numberId;
    }
    /**
    * 将当前数据保存到文件。
    */
    save() {
        fs.writeFileSync(this.#filename, JSON.stringify(this.#data));
    }
    /**
 * 创建一个新的记录。
 * @param {string} table - 表名
 * @param {Object} item - 要创建的项目对象
 * @returns {number|string|null} - 返回新创建项目的ID或null
 */
    async create(table, item) {
        updateEtag();
        if (this.#data[table]) {
            this.#data[table].__AI_ID++;
            if (this.numberId) {
                item.id = this.#data[table].__AI_ID;
            } else {
                item.id = ObjectID()
            }
            for (let field in this.#data[table].__fields) {
                if (!item[field]) {
                    item[field] = this.#data[table].__fields[field].getDefaultValue();
                } else {
                    switch (this.#data[table].__fields[field].type) {
                        case DataType.Number:
                            item[field] = Number(item[field]);
                            break;
                        case DataType.String:
                            item[field] = String(item[field]);
                            break;
                        case DataType.Date:
                            item[field] = new Date(item[field]);
                            break;
                        case DataType.Object:
                            item[field] = Object(item[field]);
                            break;
                    }
                    if (this.#data[table].__fields[field].unique || this.#data[table].__fields[field].primaryKey) {
                        if (this.#data[table].items.find(x => x[field] == item[field])) {
                            throw new ClientError(409, `unique字段${field}值重复`);
                        }
                    }
                }
            }
            this.#data[table].items.push(item);
        } else {
            return null;
        }
        return item.id;
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
        let data = this.#data[table];
        if (data) {
            let items = data.items;
            if (param.id) {
                items = items.filter(item => item.id == param.id);
            } else if (param.filter) {
                items = items.filter(item => JsonContainer.checkFilter(item, null, param.filter));
            }
            if (param.orderBy) {
                if (this.#data[table]?.__fields[param.orderBy]?.type == "string") {
                    items = items.sort((a, b) => {
                        if (param.orderDesc) {
                            return -a[param.orderBy].localeCompare(b[param.orderBy]);
                        } else {
                            return a[param.orderBy].localeCompare(b[param.orderBy]);
                        }
                    });
                } else {
                    items = items.sort((a, b) => {
                        if (param.orderDesc) {
                            return b[param.orderBy] - a[param.orderBy];
                        } else {
                            return a[param.orderBy] - b[param.orderBy];
                        }
                    });
                }
            }
            param.total = items.length;
            if (param.limit) {
                param.pages = Math.ceil(items.length / param.limit);
            } else {
                param.pages = 1;
            }
            items.splice(0, 1 * (param.offset || 0) + 1 * param.page * param.limit);
            if (param.limit) {
                items.splice(1 * param.limit);
            }
            if (param.fields) {
                return items.map(item => {
                    let obj = {};
                    for (let f of param.fields) {
                        obj[f] = item[f];
                    }
                    return obj;
                });
            } else {
                return items;
            }
        } else {
            return [];
        }
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
        let range = await this.read(table, param);
        for (let o of range) {
            if (typeof (item) == "function") {
                o = item(o);
            }
            else {
                for (let f in item) {
                    if (this.#data[table].__fields[f].unique) {
                        if (this.#data[table].items.find(x => x[f] == item[f])) {
                            throw new ClientError(409, `unique字段${f}值重复`);
                            continue;
                        }
                    }
                    o[f] = item[f];
                }
            }
        }
        return range.length;
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
        let data = this.#data[table];
        if (data) {
            let items = data.items;
            param.field = null;
            let range = await this.read(table, param);
            data.items = items.filter(item => !range.includes(item));
        }
        return;
    }
    genNewTable() {
        return {
            items: [],
            __fields: {},
            __AI_ID: 0
        }
    }
    /**
     * 设置字段
     * @param {string} tablename - 表名
     * @param {DataField} field - 要设置的字段
     */
    async setField(tablename, field) {
        if (!this.#data[tablename]) {
            this.#data[tablename] = this.genNewTable();
        }
        this.#data[tablename].__fields[field.name] = field;
        for (let i of this.#data[tablename].items) {
            if (!i[field.name]) {
                i[field.name] = field.defaultvalue;
            } else {
                switch (field.type) {
                    case DataType.Number:
                        i[field.name] = Number(i[field.name]);
                        break;
                    case DataType.String:
                        i[field.name] = String(i[field.name]);
                        break;
                    case DataType.Date:
                        i[field.name] = new Date(i[field.name]);
                        break;
                }
            }
        }
        return;
    }
}
