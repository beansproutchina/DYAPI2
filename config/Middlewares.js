// 为了防止middleware执行顺序不固定，将所有middleware的注册写在同一文件中。你也可以不这么做。
// 越早注册的middleware在更内层。
import { Configs, RegisterMiddleware } from "../dyapi/dyapi.js";
import { antiSpider } from "./AntiSpider.js";
import { authMiddleware } from "./UserSystem.js";

export default async function () {
    RegisterMiddleware("antispider",antiSpider({
        requestsPerMin: {
            soft: 20,
            hard: 600,
        },
        globalMode: false,
        softMistakeRate: 0.1,
    }))
    RegisterMiddleware("auth", authMiddleware);

}