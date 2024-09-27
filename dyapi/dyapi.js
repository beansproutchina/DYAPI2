import Fastify from 'fastify'
import * as Settings from "../config/settings.js";
export const fastify = Fastify({
    logger: true
})

export const Configs = {
    controllers: {},
    containers: {},
    models: {},
    middlewares: {},

}

export const logging = fastify.log;

export class Container {
    async create(table, item) { };
    async read(table, {
        fields,
        id,
        filter,
        orderBy,
        orderDesc,
        limit,
        page,
        offset
    }) { };
    async update(table, { id, filter }, item) { };
    async remove(table, { id, filter }) { };
    /**
     * 设置字段
     * @param {string} tablename - 表名
     * @param {DataField} field - 要设置的字段
     */
    setField(tablename, field) {
    };
}

export class JsonContainer extends Container {
    #filename = "";
    #data = {};
    #primaryKey = {};
    numberId = true;
    /**
 * 构造函数初始化JsonContainer实例。
 * @param {string} file - 存储数据的文件路径
 * @param {Object} [options] - 可选配置对象
 * @param {boolean} [options.numberId=true] - 是否使用数字作为ID，否则用ObjectID
 */
    constructor(file, { numberId = true } = {}) {
        this.#filename = file;
        if (fs.existsSync(this.#filename)) {
            try {
                this.#data = JSON.parse(fs.readFileSync(this.#filename, 'utf8'));
            } catch {
            }
        } else {
            logging.info("模型存储文件不存在，将自动创建。");
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
        if (this.#data[table]) {
            this.#data[table].__AI_ID++;
            if (this.numberId) {
                item.id = this.#data[table].__AI_ID;
            } else {
                item.id = ObjectID()
            }
            for (let field in this.#data[table].__fields) {
                if (!item[field]) {
                    if (this.#data[table].__fields[field].required) {
                        logging.error(`字段${field}为必填字段，但未设置值。`);
                        return null;
                    }
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
 * @param {string[]} [param.field] - 需要返回的字段列表
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
    async read(table, param = {
        field,
        id,
        filter,
        orderBy,
        orderDesc,
        limit,
        page,
        offset,
        total,
        pages,
    }) {
        let data = this.#data[table];
        if (data) {
            let items = data.items;
            if (id) {
                items = items.filter(item => item.id == id);
            } else if (filter) {
                items = items.filter(item => {
                    for (let f in filter) {
                        if (!checkCondition(item[f], filter[f])) {
                            return false;
                        }
                    }
                    return true;
                });
            }
            if (orderBy) {
                if (this.#data[table]?.__fields[orderBy]?.type == "string") {
                    items = items.sort((a, b) => {
                        if (orderDesc) {
                            return -a[orderBy].localeCompare(b[orderBy]);
                        } else {
                            return a[orderBy].localeCompare(b[orderBy]);
                        }
                    });
                } else {
                    items = items.sort((a, b) => {
                        if (orderDesc) {
                            return b[orderBy] - a[orderBy];
                        } else {
                            return a[orderBy] - b[orderBy];
                        }
                    });
                }
            }
            param.total = items.length;
            param.pages = Math.ceil(items.length / limit);
            items.splice(0, (offset || 0) + 1 * page * limit);
            if (limit) {
                items.splice(limit);
            }
            if (field) {
                return items.map(item => {
                    let obj = {};
                    for (let f of field) {
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
    async update(table, param = {
        id,
        filter,
        orderBy,
        orderDesc,
        limit,
        page,
        offset
    }, item) {
        param.field = null;
        let range = this.read(table, param);
        for (let o of range) {
            if (typeof (item) == "function") {
                o = item(o);
            }
            else {
                for (let f in item) {
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
    async remove(table, param = {
        id,
        filter,
        orderBy,
        orderDesc,
        limit,
        page,
        offset
    }) {
        let data = this.#data[table];
        if (data) {
            let items = data.items;
            param.field = null;
            let range = this.read(table, param);
            items = items.filter(item => !range.includes(item));
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
    setField(tablename, field) {
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
    }
}


export class DataField {
    name = ""

    type = DataType.Object;
    required = false;
    defaultvalue = null;
    #permission = {};
    /** 
     * 设置字段权限
     * @param {string} usertype - 用户类型
     * @param {string} permission - 权限(r,w,p)
     */
    setPermission(usertype, permission) {
        this.#permission[usertype] = permission + ",";
        return this;
    }
    /**
 * 检查用户类型是否具有特定权限
 * 
 * @param {string} usertype - 用户类型
 * @param {string} permission - 需要检查的权限
 * @returns {boolean} - 如果用户类型具有指定权限，则返回true，否则返回false
 */
    getPermission(usertype, permission) {
        if (this.#permission[usertype]) {
            return this.#permission[usertype].includes(permission + ",");
        } else {
            return (this.#permission["DEFAULT"] ?? "r,w,p,").includes(permission + ",");//默认为r,w,p(pop)
        }
    }
    getDefaultValue() {
        if (this.defaultvalue == null && this.type == DataType.Date) {
            return new Date();
        } else {
            return this.defaultvalue;
        }
    }
    constructor(name, type, required, defaultvalue) {
        this.name = name;
        this.type = type;
        this.required = required;
        this.defaultvalue = defaultvalue;
    }
}

export class model {
    container;
    tablename;
    #permission = {};
    services = [];
    datafields;

    constructor(container, tablename) {
        this.container = container;
        this.tablename = tablename;
        this.datafields = [new DataField("id", container.numberId ? DataType.Number : DataType.String, false, 0)]
    }
    SetField(...dataFields) {
        this.datafields.push(...dataFields);
        for (let i of dataFields) {
            this.container.setField(tablename, i);
        }
    }
    async create(item) {
        let data = await this.container.create(this.tablename, item);
        return data;
    }
    async read(param = {
        fields,
        id,
        filter,
        orderBy,
        orderDesc,
        limit,
        page,
        offset,
        pops
    }) {
        let result = await this.container.read(this.tablename, param);
        if (param.pops) {
            for (let i of result) {
                for (let p of param.pops) {
                    let pp = Configs.models[p];
                    if (pp && this.datafields.find(f => f.name == p)) {
                        let res = await pp.read({ id: i[p] });
                        if (res.length > 0) {
                            i[p + "_pop"] = res[0];
                        }
                    }
                }
            }
        }
    }
    async update(param = {
        id,
        filter,
        orderBy,
        orderDesc,
        limit,
        page,
        offset
    }, item) {
        return await this.container.update(this.tablename, param, item);
    }
    async remove(param = {
        id,
        filter,
        orderBy,
        orderDesc,
        limit,
        page,
        offset
    }) {
        return await this.container.remove(this.tablename, param);
    }
    /**
     * 设置权限
     * @param {string} usertype - 用户类型
     * @param {string} permission - 权限：可为C，RO（按ID读取单个），RL（读取列表并精确查询），R（前面两个合称），D等；逗号分隔。
     */
    setPermission(usertype, permission) {
        this.#permission[usertype] = permission + ",";
        return this;
    }
    getPermission(usertype, permission) {
        if (!this.#permission[usertype]) {
            return (this.#permission["DEFAULT"] ?? "C,R,U,D,").includes(permission + ",")//默认为CRUD
        }
        if (permission == null) { return true };
        return this.#permission[usertype].includes(permission + ",");
    }

    async Q(method, usertype, query, body) {
        switch (method) {
            case "C": {
                if (!this.getPermission(query.usertype, "C")) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                let c = await this.create(body);
                if (c != null) {
                    return {
                        code: 200,
                        id: c
                    };
                } else {
                    return {
                        code: 500,
                        msg: "创建失败"
                    };
                }
            }
                break;
            case "RO": {
                if (!this.getPermission(query.usertype, "RO") && !this.getPermission(query.usertype, "R")) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                let param = {
                    fields: [],
                    id: query.id,
                    filter: null,
                    orderBy: null,
                    orderDesc: false,
                    pops: [],
                    limit: 1,
                    page: 0,
                    offset: 0
                }
                if (query.fields) {
                    let f = query.fields.split(",");
                    for (let i of f) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(query.usertype, "r"))) {
                            param.fields.push(i);
                        }
                    }
                } else {
                    param.fields = this.datafields.filter(x => x.getPermission(query.usertype, "r")).map(x => x.name);
                }

                if (query.pops) {
                    let p = query.pops.split(",");
                    for (let i of p) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(query.usertype, "p"))) {
                            param.pops.push(i);
                        }
                    }
                }

                let r = await this.read(query);
                if (r.data.length == 0) {
                    return {
                        code: 404,
                        msg: "未找到"
                    };
                }
                return {
                    code: 200,
                    data: r.data[0]
                }
            }
                break;
            case "RL": {
                if (!this.getPermission(query.usertype, "RL") && !this.getPermission(query.usertype, "R")) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                let param = {
                    fields: [],
                    filter: body.filter,
                    orderBy: query.orderBy,
                    orderDesc: query.orderDesc,
                    limit: query.limit,
                    page: query.page,
                    offset: query.offset,
                    total: 0,
                    pages: 0,
                }
                if (query.limit > Settings.maxLimit) {
                    return {
                        code: 416,
                        msg: "超出最大限制"
                    };
                }
                if (query.fields) {
                    let f = query.fields.split(",");
                    for (let i of f) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(query.usertype, "r"))) {
                            param.fields.push(i);
                        }
                    }
                } else {
                    param.fields = this.datafields.filter(x => x.getPermission(query.usertype, "r")).map(x => x.name);
                }
                if (query.pops) {
                    let p = query.pops.split(",");
                    for (let i of p) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(query.usertype, "p"))) {
                            param.pops.push(i);
                        }
                    }
                }
                let r = this.read(param);
                return {
                    code: 200,
                    data: r,
                    total: param.total,
                    pages: param.pages
                }
            }
                break;
            case "U":
                if (!this.getPermission(query.usertype, "U")) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                let param = {
                    filter: body.filter,
                    orderBy: query.orderBy,
                    orderDesc: query.orderDesc,
                    limit: query.limit,
                    page: query.page,
                    offset: query.offset,
                    total: 0,
                    pages: 0,
                }
                let data = {};
                for (let i in body.data) {
                    if (this.datafields.find(x => x.name == i && x.getPermission(query.usertype, "w"))) {
                        data[i] = body.data[i];
                    }
                }
                let u = await this.update(param, data);
                return {
                    code: 200,
                    length: u
                }

            case "D":
                if (!this.getPermission(query.usertype, "D")) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                await this.remove(query);
                return {
                    code: 200,
                }

        }
    }

}
export function ObjectID() {
    return Math.floor(new Date().getTime() / 1000).toString(16) + randomBytes(8).toString("hex");
}
const DataType = {
    String: "string",
    Number: "number",
    Date: "date",
    Object: "object",
}
const checkCondition = (item, cond) => {
    if (typeof (cond) == "object") {
        if (cond instanceof RegExp) {
            return cond.test(item);
        } else if (cond instanceof Date) {
            return item.getTime() == cond.getTime();
        }
        for (let i in cond) {
            if (i.startsWith("$")) {
                if (i.startsWith("$or")) {
                    let or = cond[i];
                    for (let j in or) {
                        if (checkCondition(item, or[j])) break;
                    }
                    return false;
                }
                if (i.startsWith("$and")) {
                    let and = cond[i];
                    for (let j in and) {
                        if (!checkCondition(item, and[j])) return false;
                    }
                }
                if (i.startsWith("$not")) {
                    if (checkCondition(item, cond[i])) return false;
                }
                if (i == "$eq" && !(item == cond[i])) return false;
                if (i == "$ne" && !(item != cond[i])) return false;
                if (i == "$gt" && !(item > cond[i])) return false;
                if (i == "$gte" && !(item >= cond[i])) return false;
                if (i == "$lt" && !(item < cond[i])) return false;
                if (i == "$lte" && !(item <= cond[i])) return false;
                if (i.startsWith("$in") && !(cond[i].includes(item))) return false;
                if (i.startsWith("$nin") && !(!cond[i].includes(item))) return false;
                if (i.startsWith("$includes") && !(item.includes(cond[i]))) return false;
                if (i.startsWith("$nincludes") && !(!item.includes(cond[i]))) return false;
                if (i.startsWith("$start") && !(item.startsWith(cond[i]))) return false;
                if (i.startsWith("$end") && !(item.endsWith(cond[i]))) return false;
                if (i.startsWith("$regex")) {
                    let regex = new RegExp(cond[i]);
                    if (!regex.test(item)) return false;
                }
            }
        }
        return true;
    } else if (typeof (cond) == "function") {
        return cond(item);
    } else {
        return item == cond;
    }
}