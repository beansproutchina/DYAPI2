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
      router.all(`/${settings.urlPrefix}/${controller}`,  dyapi.Configs.controllers[controller]);
    }
    console.log(dyapi.Configs.models);
    for (let model in dyapi.Configs.models) {
      dyapi.logger.info(`registered model ${model}`);
      router.get(`/${settings.urlPrefix}/${model}s`, async (ctx) => {
        let res = await dyapi.Configs.models[model].Q("RL", ctx.state, ctx.query, {});
        ctx.etag = dyapi.Configs.currentEtag;
        ctx.response.body = res;
      })
      router.get(`/${settings.urlPrefix}/${model}s/:id`, async (ctx) => {
        let query = ctx.query;
        query.id = ctx.params.id;
        let res = await dyapi.Configs.models[model].Q("RO", ctx.state, query, {});
        ctx.etag = dyapi.Configs.currentEtag;
        ctx.response.body = res;
      })
      router.post(`/${settings.urlPrefix}/${model}s`,  async (ctx) => {
        let res = await dyapi.Configs.models[model].Q("C", ctx.state, ctx.query, ctx.request.body);
        ctx.response.body = res;
      })
      router.put(`/${settings.urlPrefix}/${model}s/:id`,  async (ctx) => {
        let query = ctx.query;
        query.id = ctx.params.id;
        let res = await dyapi.Configs.models[model].Q("U", ctx.state, query, ctx.request.body);
        ctx.response.body = res;
      })
      router.put(`/${settings.urlPrefix}/${model}s`,  async (ctx) => {
        let res = await dyapi.Configs.models[model].Q("U", ctx.state, ctx.query, ctx.request.body);
        ctx.response.body = res;
      })
      router.delete(`/${settings.urlPrefix}/${model}s/:id`, async (ctx) => {
        let query = ctx.query;
        query.id = ctx.params.id;
        let res = await dyapi.Configs.models[model].Q("D", ctx.state, query, {});
        ctx.response.body = res;
      })
      router.delete(`/${settings.urlPrefix}/${model}s`,  async (ctx) => {
        let res = await dyapi.Configs.models[model].Q("D", ctx.state, ctx.query, ctx.request.body);
        ctx.response.body = res;
      })
      for(let service of dyapi.Configs.models[model].services){
        router[service.operation](`/${settings.urlPrefix}/${model}s/${service.path}`, async (ctx)=>{
          let res = await dyapi.Configs.models[model].Q(service.path,ctx.state,ctx.query,ctx.request.body);
          ctx.response.body = res;
        })
      }
    }
    koa.use(koaBody());
    for (let middleware in dyapi.Configs.middlewares) {
      dyapi.logger.info(`registered middleware ${middleware}`);
      koa.use(dyapi.Configs.middlewares[middleware]);
    }

    koa.use(async (ctx, next) => {
      //logger
      let t = new Date();
      if (ctx.query.filter !== undefined) {
        try { ctx.query.filter = JSON.parse(ctx.query.filter); } catch (e) { ctx.query.filter = null };
      }
      await next();
      dyapi.logger.info(`${ctx.method} [${ctx.state?.usertype} ${ctx.state?.user?.username ?? ""}] ${ctx.url} ${ctx.status} ${new Date() - t}ms`);
    })

    koa.use(async (ctx, next) => {
      //not found
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
        dyapi.logger.error(err)
      }
    })
    koa.use(router.routes()).use(router.allowedMethods())

    dyapi.__ready();
    koa.listen(Settings.port);
    dyapi.logger.info(`server started on http://localhost:${Settings.port}`)
  } catch (err) {
    dyapi.logger.error(err)
    process.exit(1)
  }
}

start();