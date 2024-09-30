import Settings from "../config/settings.js";
import pino from "pino";
import crypto from "crypto";
import fs from "fs";
import settings from "../config/settings.js";

export const logger = pino({
    transport: {
        target: "pino-pretty",
    }
})

export const Configs = {
    controllers: {},
    containers: {},
    models: {},
    middlewares: {},
    currentEtag: crypto.randomUUID(),
}
export const updateEtag = () => {
    Configs.currentEtag = crypto.randomUUID();
}

/** 
 * @param {string} name - 用于在Configs中标识控制器的唯一名称
 * @param {function} obj - 需要注册的控制器对象
*/
export const RegisterController = (name, fn) => {
    if (Configs.controllers[name]) {
        logger.error(`控制器名称${name}已存在，无法注册。`);
        return;
    }
    if (name.endsWith("s")) {
        logging.error(`控制器${name}不能以s结尾，防止与模型访问冲突。`)
    }
    Configs.controllers[name] = fn;
}
/**
 * @param {string} name 
 * @param {Container} obj 
 */
export const RegisterContainer = (name, obj) => {
    if (Configs.containers[name]) {
        logger.error(`容器名称${name}已存在，无法注册。`);
        return;
    }
    Configs.containers[name] = obj;
}
/**
 * 
 * @param {string} name 
 * @param {model} obj 
 */
export const RegisterModel = (name, obj) => {
    if (Configs.models[name]) {
        logger.error(`模型名称${name}已存在，无法注册。`);
        return;
    }
    Configs.models[name] = obj;
}
/**
 * 
 * @param {string} name 
 * @param {function} obj 
 */
export const RegisterMiddleware = (name, fn) => {
    if (Configs.middlewares[name]) {
        logger.error(`中间件名称${name}已存在，无法注册。`);
        return;
    }
    Configs.middlewares[name] = fn;
}


export class Container {
    async create(table, item) {
    };
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
    async update(table, { id, filter }, item) {
    };
    async remove(table, { id, filter }) {
    };
    /**
     * 设置字段
     * @param {string} tablename - 表名
     * @param {DataField} field - 要设置的字段
     */
    setField(tablename, field) {
    };
}


export class DataField {
    name = ""

    type = DataType.Object;
    required = false;
    defaultvalue = null;
    primaryKey = false;
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
    setPrimaryKey() {
        this.primaryKey = true;
        return this;
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
        this.datafields = [new DataField("id", container.numberId ? DataType.Number : DataType.String, false, 0).setPrimaryKey()]
    }
    SetField(...dataFields) {
        this.datafields.push(...dataFields);
        for (let i of dataFields) {
            this.container.setField(this.tablename, i);
        }
        return this;
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

        return result;
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
                if (!this.getPermission(usertype, "C")) {
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
                if (!this.getPermission(usertype, "RO") && !this.getPermission(usertype, "R")) {
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
                        if (this.datafields.find(x => x.name == i && x.getPermission(usertype, "r"))) {
                            param.fields.push(i);
                        }
                    }
                } else {
                    param.fields = this.datafields.filter(x => x.getPermission(usertype, "r")).map(x => x.name);
                }

                if (query.pops) {
                    let p = query.pops.split(",");
                    for (let i of p) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(usertype, "p"))) {
                            param.pops.push(i);
                        }
                    }
                }

                let r = await this.read(query);
                if (r.length == 0) {
                    return {
                        code: 404,
                        msg: "未找到"
                    };
                }
                return {
                    code: 200,
                    data: r[0]
                }
            }
                break;
            case "RL": {
                if (!this.getPermission(usertype, "RL") && !this.getPermission(usertype, "R")) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                let param = {
                    fields: [],
                    filter: query.filter,
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
                if(query.limit == null){
                    param.limit = Settings.maxLimit;
                }
                if (query.fields) {
                    let f = query.fields.split(",");
                    for (let i of f) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(usertype, "r"))) {
                            param.fields.push(i);
                        }
                    }
                } else {
                    param.fields = this.datafields.filter(x => x.getPermission(usertype, "r")).map(x => x.name);
                }
                if (query.pops) {
                    let p = query.pops.split(",");
                    for (let i of p) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(usertype, "p"))) {
                            param.pops.push(i);
                        }
                    }
                }
                let r = await this.read(param);
                return {
                    code: 200,
                    data: r,
                    total: param.total,
                    pages: param.pages
                }
            }
                break;
            case "U":
                if (!this.getPermission(usertype, "U")) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                if (query.id == null && !settings.multiUpdate) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                let param = {
                    id: query.id,
                    filter: query.filter,
                    orderBy: query.orderBy,
                    orderDesc: query.orderDesc,
                    limit: query.limit,
                    page: query.page,
                    offset: query.offset,
                    total: 0,
                    pages: 0,
                }
                let data = {};
                for (let i in body) {
                    if (this.datafields.find(x => x.name == i && x.getPermission(usertype, "w"))) {
                        data[i] = body[i];
                    }
                }
                let u = await this.update(param, data);
                return {
                    code: 200,
                    length: u
                }

            case "D":
                if (!this.getPermission(usertype, "D")) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                if (query.id == null && !settings.multiDelete) {
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
    return Math.floor(new Date().getTime() / 1000).toString(16) + Math.floor(new Date().getTime() % 1000).toString(16).padStart(16,"ABC1230000000000")
}
export const DataType = {
    String: "string",
    Number: "number",
    Float : "float",
    Date: "date",
    Object: "object",
}/*
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
                    let or = filter[i];
                    for (let j in or) {
                        if (checkCondition(item, or[j])) break;
                    }
                    return false;
                }
                if (i.startsWith("$and")) {
                    let and = filter[i];
                    for (let j in and) {
                        if (!checkCondition(item, and[j])) return false;
                    }
                }
                if (i.startsWith("$not")) {
                    if (checkCondition(item, filter[i])) return false;
                }
                if (i == "$eq" && !(item == filter[i])) return false;
                if (i == "$ne" && !(item != filter[i])) return false;
                if (i == "$gt" && !(item > filter[i])) return false;
                if (i == "$gte" && !(item >= filter[i])) return false;
                if (i == "$lt" && !(item < filter[i])) return false;
                if (i == "$lte" && !(item <= filter[i])) return false;
                if (i.startsWith("$in") && !(filter[i].includes(item))) return false;
                if (i.startsWith("$nin") && !(!filter[i].includes(item))) return false;
                if (i.startsWith("$includes") && !(item.includes(filter[i]))) return false;
                if (i.startsWith("$nincludes") && !(!item.includes(filter[i]))) return false;
                if (i.startsWith("$start") && !(item.startsWith(filter[i]))) return false;
                if (i.startsWith("$end") && !(item.endsWith(filter[i]))) return false;
                if (i.startsWith("$regex")) {
                    let regex = new RegExp(filter[i]);
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
}*/