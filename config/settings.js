const crypto=require("crypto");
const passwordHash=(password)=>{
    return crypto.createHash("md5").update(password+"ywy521").digest("hex");
}

module.exports = {
    // API前缀
    urlPrefix:"api",
    // 服务器端口
    port: 3000,
    // 保存数据的间隔时间
    saveInterval: 60 * 1000,
    // 数据最大限制量
    maxLimit: 100,
    // JWT过期时间
    jwtExpire: 1000 * 60 * 60 * 24,
    // JWT密钥
    jwtSecret: "nihao",
    // 是否将JWT放在cookie token中，否则放在header的X-DYAPI-Token中
    cookieLogin: true,
    // 密码哈希函数
    passwordHash,
};