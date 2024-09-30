import * as dyapi from "../dyapi/dyapi.js";
import { JsonContainer } from "../dyapi/JsonContainer.dyapi.js";
import { SQLiteContainer } from "../dyapi/SqliteContainer.dyapi.js";
const UserContainer = new JsonContainer("./data/user.json", { numberId: true });
const TweetContainer = new SQLiteContainer("./data/tweet.db", { numberId: false });

const UserModel = new dyapi.model(UserContainer, "users")
    .setPermission("DEFAULT", "C,R,U,D")
    .SetField(
        new dyapi.DataField("username", dyapi.DataType.String, true, ""),
        new dyapi.DataField("password", dyapi.DataType.String, true, "").setPermission("DEFAULT", "w"),
        new dyapi.DataField("lastontime", dyapi.DataType.Date, false, null),
        new dyapi.DataField("role", dyapi.DataType.String, false, "user").setPermission("DEFAULT", "r").setPermission("admin", "r,w"),
    )

const TweetModel = new dyapi.model(TweetContainer, "tweets")
    .setPermission("DEFAULT", "C,R,U,D")
    .SetField(
        new dyapi.DataField("content", dyapi.DataType.String, true, ""),
        new dyapi.DataField("uid", dyapi.DataType.Number, true, 0),
        new dyapi.DataField("createdtime", dyapi.DataType.Date, false, null),
    )

export default () => {
    dyapi.RegisterContainer("user", UserContainer)
    dyapi.RegisterContainer("tweet", TweetContainer)
    dyapi.RegisterModel("tweet", TweetModel)
    dyapi.RegisterModel("user", UserModel)
}