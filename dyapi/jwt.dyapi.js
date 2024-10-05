import { createHmac } from "crypto";
import settings from '../config/settings.js';

export const newJwt=(payload)=>{//生成jwt
    payload.exp=Date.now()+settings.jwtExpire;

    let data=Buffer.from(JSON.stringify({
        'typ':'JWT',
        'alg':'HS256'
    })).toString("base64url")+"."+Buffer.from(JSON.stringify(payload)).toString("base64url");
    data=data+"."+createHmac('sha256',settings.jwtSecret).update(data).digest("hex");
    return data;
}
export const checkJwt=(jwt)=>{//校验jwt
    if(jwt){
        let data=jwt.split(".");
        if(data.length==3){
            let header=JSON.parse(Buffer.from(data[0],"base64url").toString());
            let payload=JSON.parse(Buffer.from(data[1],"base64url").toString());
            let sign=data[2];
            let newsign=createHmac('sha256',settings.jwtSecret).update(`${data[0]}.${data[1]}`).digest("hex");
            if(header.typ=="JWT"&&header.alg=="HS256"&&sign==newsign){
                if(Number(payload.exp)<Date.now()){
                    return null;
                }
                return payload;
            }
        }
    }
    return null
}