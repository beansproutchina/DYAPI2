import * as dyapi from './dyapi/dyapi.js' ;



dyapi.fastify.get('/', async (request, reply) => {
  return { hello: 'world' }
})

const start = async () => {
  try {
    await dyapi.fastify.listen({ port: 3000 })
  } catch (err) {
    dyapi.logging.error(err)
    process.exit(1)
  }
}
start()