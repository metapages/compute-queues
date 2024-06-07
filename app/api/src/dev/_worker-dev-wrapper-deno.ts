import {
  createHandler,
} from 'https://deno.land/x/metapages@v0.0.26/worker/routing/handlerDeno.ts';

import { handlerHttp } from '../handlerHono.ts';
import { handleWebsocketConnection } from '../handlerWs.ts';

const APP_FQDN = Deno.env.get("APP_FQDN") || 'https://connect.superslides.io';

const requestHandler = createHandler(handlerHttp, handleWebsocketConnection);

const config = {
  onError: (e: unknown) => {
    console.error(e);
    return Response.error();
  },
  onListen: ({hostname, port}) => {
    console.log(`🚀🌙 Listening on APP_FQDN=${APP_FQDN} hostname=${hostname} port=${port}`);
  },
};

Deno.serve({
  port: 3001,
  cert: Deno.readTextFileSync("../.traefik/certs/local-cert.pem"),
  key: Deno.readTextFileSync("../.traefik/certs/local-key.pem"),
  ...config,
}, requestHandler);

Deno.serve({
  port: 3002,
  ...config,
}, requestHandler);






