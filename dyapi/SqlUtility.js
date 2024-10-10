
export class SQLUtility {
    static filterToSQL(key, filter, array) {
        if (key == null) {
            let r = [];
            for (let k in filter) {
                if (k.startsWith("$and")) {
                    r.push("(" + Object.entries(filter[k]).map(f => {
                        let a = [];
                        a[f[0]] = f[1];
                        return SQLUtility.filterToSQL(null, a, array)
                    }).join(" AND ") + ")");
                }
                else if (k.startsWith("$or")) {
                    r.push("(" + Object.entries(filter[k]).map(f => {
                        let a = [];
                        a[f[0]] = f[1];
                        return SQLUtility.filterToSQL(null, a, array)
                    }).join(" OR ") + ")");
                }
                else if (k.startsWith("$not")) {
                    r.push("(NOT (" + SQLUtility.filterToSQL(null, filter[k], array) + "))");
                }
                else {
                    if (k.startsWith("$")) {
                        logger.error(`不支持的过滤器类型${k}。`);
                        continue;
                    } else {
                        r.push(SQLUtility.filterToSQL(k, filter[k], array))
                    }
                }
            }
            return r.join(" AND ");
        }
        else {
            key = SQLUtility.AntiSqlInject(key);
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
                                    return SQLUtility.filterToSQL(key, a, array)
                                }).join(" OR ") + ")")
                            }
                            else if (k.startsWith("$and")) {
                                r.push("(" + Object.entries(filter[k]).map(f => {
                                    let a = [];
                                    a[f[0]] = f[1];
                                    return SQLUtility.filterToSQL(key, a, array)
                                }).join(" AND ") + ")")
                            } else if (k.startsWith("$not")) {
                                r.push("(NOT " + SQLUtility.filterToSQL(key, filter[k], array) + ")");
                            } else if (k.startsWith("$eq")) {
                                r.push(`\`${key}\` = ?`);
                                array.push(filter[k]);
                            }
                            else if (k.startsWith("$ne")) {
                                r.push(`\`${key}\` != ?`);
                                array.push(filter[k]);
                            } else if (k.startsWith("$gte")) {
                                r.push(`\`${key}\` >= ?`);
                                array.push(filter[k]);
                            } else if (k.startsWith("$gt")) {
                                r.push(`\`${key}\` > ?`);
                                array.push(filter[k]);
                            }
                            else if (k.startsWith("$lte")) {
                                r.push(`\`${key}\` <= ?`);
                                array.push(filter[k]);
                            } else if (k.startsWith("$lt")) {
                                r.push(`\`${key}\` < ?`);
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
            sql += " WHERE " + SQLUtility.filterToSQL(null, param.filter, array);
        }
        if (param.orderBy) {
            sql += ` ORDER BY \`${SQLUtility.AntiSqlInject(param.orderBy)}\``;
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