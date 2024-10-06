import * as dyapi from "../dyapi/dyapi.js";
import { JsonContainer } from "../dyapi/JsonContainer.dyapi.js";
import { checkJwt, newJwt } from "../dyapi/jwt.dyapi.js";
import { SQLiteContainer } from "../dyapi/SqliteContainer.dyapi.js";
import settings from "./settings.js";
const UserContainer = new SQLiteContainer("./data/dyapi.db", { numberId: true });

export const authMiddleware = async (ctx, next) => {
    ctx.state.usertype = "PUBLIC";
    let a, b;
    if (settings.cookieLogin) {
        if (a = ctx.cookies.get("token")) {
            b = checkJwt(a);
        }
    } else {
        if (a = ctx.get("X-DYAPI-Token")) {
            b = checkJwt(a);
        }
    }
    if (b) {
        ctx.state.user = b;
        ctx.state.usertype = b.role;
    }
    await next();
};

export default async () => {
    const UserModel = await new dyapi.model(UserContainer, "users")
        .setPermission("DEFAULT", "R,U")
        .SetField(
            new dyapi.DataField("username", dyapi.DataType.String, "").setValidator(dyapi.VALIDATORS.length(3, 20)),
            new dyapi.DataField("password", dyapi.DataType.String, "").setValidator(dyapi.VALIDATORS.length(3, 20)).setProcessor(settings.passwordHash).setPermission("DEFAULT", "w"),
            new dyapi.DataField("lastontime", dyapi.DataType.Date, null),
            new dyapi.DataField("role", dyapi.DataType.String, "user").setPermission("DEFAULT", "r").setPermission("admin", "r,w"),
        )

    dyapi.RegisterController("login", async (ctx) => {
        dyapi.assert(dyapi.VALIDATORS.schema({
            type: "object",
            properties: {
                username: { type: "string" },
                password: { type: "string" }
            },
            required: ["username", "password"]
        })(ctx.request.body), dyapi.ClientError, 400, "参数错误");
        let user = await UserModel.read({ filter: { username: ctx.request.body.username, password: settings.passwordHash(ctx.request.body.password) } });
        if (user.length == 0) {
            ctx.body = {
                code: 400,
                msg: "用户名或密码错误"
            }
        } else {
            let j = newJwt({
                id: user[0].id,
                username: user[0].username,
                role: user[0].role
            })
            if (settings.cookieLogin) {
                ctx.cookies.set("token", j, { httpOnly: false, maxAge: settings.jwtExpire });
            }
            ctx.body = {
                code: 200,
                msg: "登录成功",
                data: {
                    token: j,
                    user: user[0]
                }
            }
        }
    })

    dyapi.RegisterController("register", async (ctx) => {
        const { username, password } = ctx.request.body
        dyapi.assert(dyapi.VALIDATORS.length(3, 10)(username) && dyapi.VALIDATORS.length(3, 10)(password), dyapi.ClientError, 400, "参数错误")
        let user = await UserModel.read({
            filter: {
                username,
            }
        })
        if (user.length) {
            ctx.body = { code: 400, msg: "用户名已存在" }
            return;
        } else {
            let result = await UserModel.create({
                username,
                password,
            })
            if (result) {
                ctx.body = { code: 200, msg: "注册成功" }
            } else {
                ctx.body = { code: 400, msg: "注册失败" }
            }
        }
    })


    await dyapi.RegisterContainer("user", UserContainer)
    await dyapi.RegisterModel("user", UserModel)

}