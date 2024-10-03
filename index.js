import Settings from './config/settings.js';
import * as dyapi from './dyapi/dyapi.js';
import Koa from 'koa';
import Router from '@koa/router'
import fs from 'fs'
import settings from './config/settings.js';
import koaBody from 'koa-body-esm';


const koa = new Koa();
const router = new Router();



const start = async () => {
  try {
    let files = fs.readdirSync('./config');
    for (let file of files) {
      let module = await import(`./config/${file}`);

      if(typeof module.default === 'function'){
        await module.default();
      }
      
    }

    for (let controller in dyapi.Configs.controllers) {
      dyapi.logger.info(`registered controller ${controller}`);
      router.all(settings.urlPrefix + "/" + controller, dyapi.Configs.controllers[controller]);
    }
    console.log(dyapi.Configs.models);
    for (let model in dyapi.Configs.models) {
      dyapi.logger.info(`registered model ${model}`);
      router.get(`/${settings.urlPrefix}/${model}s`, async (ctx) => {
        let res = await dyapi.Configs.models[model].Q("RL", ctx.state?.user?.type, ctx.query, {});
        ctx.etag = dyapi.Configs.currentEtag;
        ctx.response.body = res;
      })
      router.get(`/${settings.urlPrefix}/${model}s/:id`, async (ctx) => {
        let query = ctx.query;
        query.id = ctx.params.id;
        let res = await dyapi.Configs.models[model].Q("RO", ctx.state?.user?.type, query, {});
        ctx.etag = dyapi.Configs.currentEtag;
        ctx.response.body = res;
      })
      router.post(`/${settings.urlPrefix}/${model}s`, koaBody(), async (ctx) => {
        let res = await dyapi.Configs.models[model].Q("C", ctx.state?.user?.type, ctx.query, ctx.request.body);
        ctx.response.body = res;
      })
      router.put(`/${settings.urlPrefix}/${model}s/:id`, koaBody(), async (ctx) => {
        let query = ctx.query;
        query.id = ctx.params.id;
        let res = await dyapi.Configs.models[model].Q("U", ctx.state?.user?.type, query, ctx.request.body);
        ctx.response.body = res;
      })
      router.put(`/${settings.urlPrefix}/${model}s`, koaBody(), async (ctx) => {
        let res = await dyapi.Configs.models[model].Q("U", ctx.state?.user?.type, ctx.query, ctx.request.body);
        ctx.response.body = res;
      })
      router.delete(`/${settings.urlPrefix}/${model}s/:id`, async (ctx) => {
        let query = ctx.query;
        query.id = ctx.params.id;
        let res = await dyapi.Configs.models[model].Q("D", ctx.state?.user?.type, query, {});
        ctx.response.body = res;
      })
      router.delete(`/${settings.urlPrefix}/${model}s`, koaBody(), async (ctx) => {
        let res = await dyapi.Configs.models[model].Q("D", ctx.state?.user?.type, ctx.query, ctx.request.body);
        ctx.response.body = res;
      })
    }
    for (let middleware in dyapi.Configs.middlewares) {
      dyapi.logger.info(`registered middleware ${middleware}`);
      router.use(dyapi.Configs.middlewares[middleware]);
    }

    koa.use(async (ctx, next) => {
      let t = new Date();
      if (ctx.query.filter !== undefined) {
        try { ctx.query.filter = JSON.parse(ctx.query.filter); } catch (e) { ctx.query.filter = null };
      }
      await next();
      dyapi.logger.info(`${ctx.method} ${ctx.url} ${ctx.status} ${new Date() - t}ms`);
    })

    koa.use(async (ctx, next) => {
      try {
        await next();
        if (ctx.body == null) {
          ctx.body = {
            code: 400,
            message: "方法/资源不存在"
          };
        }
      } catch (err) {
        ctx.status = 200
        ctx.body = {
          code: err.statusCode || err.status || 500,
          message: err.message
        };
      }
    })
    koa.use(router.routes()).use(router.allowedMethods())


    koa.listen(Settings.port);
    dyapi.logger.info(`server started on http://localhost:${Settings.port}`)
  } catch (err) {
    dyapi.logger.error(err)
    process.exit(1)
  }
}

start();