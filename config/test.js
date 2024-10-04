import * as dyapi from "../dyapi/dyapi.js";
import { JsonContainer } from "../dyapi/JsonContainer.dyapi.js";
import { SQLiteContainer } from "../dyapi/SqliteContainer.dyapi.js";
import settings from "./settings.js";
const UserContainer = new JsonContainer("./data/user.json", { numberId: true });
const TweetContainer = new SQLiteContainer("./data/tweet.db", { numberId: false });



export default async () => {
    const UserModel = await new dyapi.model(UserContainer, "users")
        .setPermission("DEFAULT", "C,R,U,D")
        .SetField(
            new dyapi.DataField("username", dyapi.DataType.String, "").setValidator(dyapi.VALIDATORS.length(3,20)),
            new dyapi.DataField("password", dyapi.DataType.String, "").setValidator(dyapi.VALIDATORS.length(3,20)).setProcessor(settings.passwordHash).setPermission("DEFAULT", "w"),
            new dyapi.DataField("lastontime", dyapi.DataType.Date, null),
            new dyapi.DataField("role", dyapi.DataType.String, "user").setPermission("DEFAULT", "r").setPermission("admin", "r,w"),
        )
    

    const TweetModel = await new dyapi.model(TweetContainer, "tweets")
        .setPermission("DEFAULT", "C,R,U,D")
        .SetField(
            new dyapi.DataField("content", dyapi.DataType.String, "").setValidator(dyapi.VALIDATORS.length(3,20)),
            new dyapi.DataField("uid", dyapi.DataType.Number, 0).setValidator(dyapi.VALIDATORS.length(3,20)),
            new dyapi.DataField("createdtime", dyapi.DataType.Date, null),
        )
    TweetModel.registerPrehandler("RO",async (state,query,body)=>{
        query.id="66fab1faABC12300000111111"
    })
    dyapi.RegisterContainer("user", UserContainer)
    dyapi.RegisterContainer("tweet", TweetContainer)
    dyapi.RegisterModel("tweet", TweetModel)
    dyapi.RegisterModel("user", UserModel)
    dyapi.RegisterCronJob("*/3 * * * * *", async () => {
        dyapi.logger.info("cron job executed")
    })
}