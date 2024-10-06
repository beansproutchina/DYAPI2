import Settings from "../config/settings.js";
import pino from "pino";
import crypto from "crypto";
import fs from "fs";
import settings from "../config/settings.js";
import Cron from 'node-cron';
import { validate } from "jsonschema";

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

export const assert=(condition,errType,...params)=>{
    if(!condition){
        throw new errType(...params);
    }
}

export class ClientError extends Error {
    constructor(code,...params){
        super(...params);
        if(Error.captureStackTrace){
            Error.captureStackTrace(this, ClientError);
        }
        this.statusCode = code;
    }
}

export const VALIDATORS = {
    required: (v) => !!v,
    length: (min, max) => {
        return (v) => {
            return typeof v == "string" && v.length >= min && v.length <= max;
        }
    },
    schema: (schema) => {
        return (v) => {
            return validate(v,schema);
        }
    }

}
/** 
 * @param {string} name - 用于在Configs中标识控制器的唯一名称
 * @param {function(ctx)} obj - 需要注册的控制器对象
*/
export const RegisterController = (name, fn) => {
    if (Configs.controllers[name]) {
        logger.error(`控制器名称${name}已存在，无法注册。`);
        return;
    }
    if (name.endsWith("s")) {
        logger.error(`控制器${name}不能以s结尾，防止与模型访问冲突。`)
    }
    Configs.controllers[name] = fn;
    return;
}
/**
 * @param {string} name 
 * @param {Container} obj 
 */
export const RegisterContainer = async (name, obj) => {
    if (Configs.containers[name]) {
        logger.error(`容器名称${name}已存在，无法注册。`);
        return;
    }
    Configs.containers[name] = obj;
    if (obj.init) {
        await obj.init();
    }
    return;
}
/**
 * 
 * @param {string} name 
 * @param {model} obj 
 */
export const RegisterModel = async (name, obj) => {
    if (Configs.models[name]) {
        logger.error(`模型名称${name}已存在，无法注册。`);
        return;
    }
    Configs.models[name] = obj;
    if (obj.init) {
        await obj.init();
    }
    return;
}

export const RegisterCronJob = async (cron, fn) => {
    logger.info(`注册定时任务：${cron}`);
    Cron.schedule(cron, fn,{
        timezone: settings.cronTimezone
    });
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
    /**
     * 初始化容器，可以在这里执行一些初始化操作，如创建表结构等。
     */
    async init() {
    }
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
    async setField(tablename, field) {
    };
}


export class DataField {
    name = ""
    type = DataType.Object;
    defaultvalue = null;
    primaryKey = false;
    unique = false;
    #permission = {};
    #validator = [];
    #processor = [];
    /** 
     * 设置字段权限
     * @param {string} state.usertype - 用户类型
     * @param {string} permission - 权限(r,w,p)
     */
    setPermission(usertype, permission) {
        this.#permission[usertype] = permission + ",";
        return this;
    }
    /**
 * 检查用户类型是否具有特定权限
 * 
 * @param {string} state.usertype - 用户类型
 * @param {string} permission - 需要检查的权限
 * @returns {boolean} - 如果用户类型具有指定权限，则返回true，否则返回false
 */
    getPermission(usertype, permission) {
        if (this.#permission[usertype]) {
            return this.#permission[usertype].includes(permission + ",");
        } else {
            return (this.#permission["DEFAULT"] ?? settings.defaultFieldPermission).includes(permission + ",");//默认为r,w,p(pop)
        }
    }
    /**
     * 获取默认值
     * @returns {object} - 默认值
     */
    getDefaultValue() {
        if (this.defaultvalue == null && this.type == DataType.Date) {
            return new Date();
        } else {
            return this.defaultvalue;
        }
    }
    /**
     * 设置为主键（暂无作用）
     */
    setPrimaryKey() {
        this.primaryKey = true;
        return this;
    }
    /**
     * 设置为独一无二
     */
    setUnique() {
        this.unique = true;
        return this;
    }
    /**
     * 设置校验器
     * @param {...Function} validator - 校验器
     */
    setValidator(...validator) {
        this.#validator.push(...validator);
        return this;
    }
    /** 设置处理器
     * @param {...Function} processor - 处理器
     */
    setProcessor(...processor) {
        this.#processor.push(...processor);
        return this;
    }
    validation(val) {
        for (let i of this.#validator) {
            let r = i(val);
            if (r !== true) {
                return false;
            }
        }
        return true;
    }
    process(val) {
        let r;
        switch (this.type) {
            case "number":
                r = Number(val);
                break;
            case "string":
                r = String(val);
                break;
            case "float":
                r = Number(val);
                break;
            case "date":
                r = new Date(val);
                break;
            case "object":
                try {
                    r = JSON.parse(val);
                } catch (e) {
                    r = val;
                }
            default:
                r = val;
        }
        for (let i of this.#processor) {
            r = i(r);
        }

        return r;
    }
    constructor(name, type, defaultvalue) {
        this.name = name;
        this.type = type;
        this.defaultvalue = defaultvalue;
    }
}

export class model {
    container;
    tablename;
    #permission = {};
    services = [];
    datafields;
    #preHandlers =[];

    constructor(container, tablename) {
        this.container = container;
        this.tablename = tablename;
        this.datafields = [new DataField("id", container.numberId ? DataType.Number : DataType.String, 0).setPrimaryKey()]
    }
    async SetField(...dataFields) {
        this.datafields.push(...dataFields);
        for (let i of dataFields) {
            await this.container.setField(this.tablename, i);
        }
        return this;
    }
    async create(item) {
        for (let i in item) {
            let f = this.datafields.find(x => x.name == i);
            if (f == undefined) {
                throw new ClientError(400,`字段${i}不存在`);
            } else {
                if (!f.validation(item[i])) {
                    throw new ClientError(400,`字段${i}不符合验证规则`);
                }
                item[i] = f.process(item[i]);
            }
        }
        if (item.id) {
            delete item.id;
        }
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
        for (let i in item) {
            let f = this.datafields.find(x => x.name == i);
            if (f == undefined) {
                throw new ClientError(400,`字段${i}不存在`);
                return null;
            } else {
                if (!f.validation(item[i])) {
                    throw new ClientError(400,`字段${i}不符合验证规则`);
                }
                item[i] = f.process(item[i]);
            }
        }
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
     * @param {string} state.usertype - 用户类型
     * @param {string} permission - 权限：可为C，RO（按ID读取单个），RL（读取列表），R（前面两个合称），D等；逗号分隔。
     */
    setPermission(usertype, permission) {
        this.#permission[usertype] = permission + ",";
        return this;
    }
    /**
     * 获取用户是否具有某权限
     * @param {string} state.usertype - 用户类型
     * @param {string} permission - 权限：C，RO（按ID读取单个），RL（读取列表），R（前面两个合称），D等。
     * @returns {boolean} 是否有权限
     */
    getPermission(usertype, permission) {
        if (!this.#permission[usertype]) {
            return (this.#permission["DEFAULT"] ?? settings.defaultModelPermission).includes(permission + ",")//默认为CRUD
        }
        if (permission == null) { return true };
        return this.#permission[usertype].includes(permission + ",");
    }
    /**
     * 注册服务，URL为 /{urlPrefix}/{model}/:path
     * @param {string} permission 权限字母
    * @param {string} path 服务名
     * @param {string} method HTTP METHOD
     * @param {function(state, query, body)} service 服务
     */

    registerService(permission,path, method,  service) {
        this.services.push({
            permission: permission,
            method: method,
            path: path,
            service: service,
        })
        return this;
    }
    /**
     * 注册一个前置处理器
     * @param {string} method 操作名，如C,RO,RL,U,D及各个服务的path。
     * @param {function(state,query,body)} handler 处理器
     */
    registerPrehandler(method,handler) {
        this.#preHandlers.push([method,handler]);
        return this;
    }


    async Q(method, state, query, body) {
        for(let [m,h] of this.#preHandlers){
            if(m==method){
                await h(state,query,body);
            }
        }
        switch (method) {
            case "C": {
                if (!this.getPermission(state.usertype, "C")) {
                    return {
                        code: 403,
                        msg: "没有权限"
                    };
                }
                let data = {};
                for (let i in body) {
                    if (this.datafields.find(x => x.name == i && x.getPermission(state.usertype, "w"))) {
                        data[i] = body[i];
                    }
                }

                let c = await this.create(data);
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
                if (!this.getPermission(state.usertype, "RO") && !this.getPermission(state.usertype, "R")) {
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
                        if (this.datafields.find(x => x.name == i && x.getPermission(state.usertype, "r"))) {
                            param.fields.push(i);
                        }
                    }
                } else {
                    param.fields = this.datafields.filter(x => x.getPermission(state.usertype, "r")).map(x => x.name);
                }

                if (query.pops) {
                    let p = query.pops.split(",");
                    for (let i of p) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(state.usertype, "p"))) {
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
                if (!this.getPermission(state.usertype, "RL") && !this.getPermission(state.usertype, "R")) {
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
                if (query.limit == null) {
                    param.limit = Settings.maxLimit;
                }
                if (query.fields) {
                    let f = query.fields.split(",");
                    for (let i of f) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(state.usertype, "r"))) {
                            param.fields.push(i);
                        }
                    }
                } else {
                    param.fields = this.datafields.filter(x => x.getPermission(state.usertype, "r")).map(x => x.name);
                }
                if (query.pops) {
                    let p = query.pops.split(",");
                    for (let i of p) {
                        if (this.datafields.find(x => x.name == i && x.getPermission(state.usertype, "p"))) {
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
                if (!this.getPermission(state.usertype, "U")) {
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
                    if (this.datafields.find(x => x.name == i && x.getPermission(state.usertype, "w"))) {
                        data[i] = body[i];
                    }
                }
                let u = await this.update(param, data);
                return {
                    code: 200,
                    length: u
                }

            case "D":
                if (!this.getPermission(state.usertype, "D")) {
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
            default:
                for (let i of this.services) {
                    if (i.path == method && this.getPermission(state.usertype, i.permission)) {
                        return i.service.bind(this, state, query, body);
                    }
                }
        }
    }

}

export function ObjectID() {
    return Math.floor(new Date().getTime() / 1000).toString(16) + Math.floor(new Date().getTime() % 1000).toString(16).padStart(16, Settings.deviceId);
}
export const DataType = {
    String: "string",
    Number: "number",
    Float: "float",
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