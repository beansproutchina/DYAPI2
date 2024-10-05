const safelist = ["{", "}", ",", "[", "]", ":", "\\", '"', "n", "u", "l", "T", "Z"];
const ipBucket = {
}

export const antiSpider = (settings={
    requestsPerMin: {
        soft: 20,
        hard: 600,
    },
    globalMode: false,
    softMistakeRate: 0.1,
}) => {
    setInterval(() => {
        for (let [key, val] of Object.entries(ipBucket)) {
            ipBucket[key] -= settings.requestsPerMin.soft;
            if (ipBucket[key] < 0) {
                delete ipBucket[key];
            }
        }
    }, 60 * 1000);

    return async (ctx, next) => {
        console.log(ipBucket);
        let ip = "t"
        if (!settings.globalMode) {
            if (!(ip=ctx.get('x-real-ip'))) {
                ip = ctx.ip;
            }
        }
        if (ipBucket[ip]) {
            if (ipBucket[ip] >= settings.requestsPerMin.hard) {
                ctx.body = {
                    status: 429,
                    message: "Too many requests",
                }
            } else if (ipBucket[ip] >= settings.requestsPerMin.soft) {
                ipBucket[ip]++;
                await next();
                if (!ctx.body) {
                    return;
                }
                let code = ctx.body.code;
                let message = ctx.body.message;
                let tosend = JSON.stringify(ctx.body);
                for (let i = 0; i < tosend.length * settings.softMistakeRate; i++) {
                    let pos = Math.floor(Math.random() * tosend.length);
                    if (safelist.includes(tosend[pos])) {
                        continue;
                    }
                    if (tosend.slice(0, pos).lastIndexOf('":') < Math.max(tosend.slice(0, pos).lastIndexOf(','), tosend.slice(0, pos).lastIndexOf('{'))) {
                        continue;
                    }
                    if (Math.min(tosend.slice(pos, tosend.length).indexOf(","), tosend.slice(pos, tosend.length).indexOf("}")) > tosend.slice(pos, tosend.length).indexOf(":")) {
                        continue;
                    }
                    let ahoh;
                    if (isNaN(tosend[pos])) {
                        let code = tosend.charCodeAt(pos);
                        if (code >= 65 && code <= 90) {
                            //大写字母
                            ahoh = String.fromCharCode(65 + Math.floor(Math.random() * 26))
                        } else if (code >= 97 && code <= 122) {
                            //小写字母
                            ahoh = String.fromCharCode(97 + Math.floor(Math.random() * 26))
                        } else {
                            //其他字符
                            ahoh = String.fromCharCode(tosend.charCodeAt(pos) + Math.floor(Math.random() * 15) - 5)
                        }
                        if (safelist.includes(ahoh)) {
                            continue;
                        }
                    } else {
                        //数字
                        ahoh = String(Math.floor(Math.random() * 9) + 1)
                    }
                    tosend = tosend.slice(0, pos) + ahoh + tosend.slice(pos + 1, tosend.length);
                }
                ctx.body = JSON.parse(tosend)
                ctx.body.code = code;
                //res.tosend.message= message;
            }
            else {
                ipBucket[ip]++;
                await next();
            }
        } else {
            ipBucket[ip] = 1;
            await next();
        }
    }
}
