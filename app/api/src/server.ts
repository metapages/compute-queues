import {
  createHandler,
} from "https://deno.land/x/metapages@v0.0.27/worker/routing/handlerDeno.ts";

import { handlerHttp } from "./handlerHono.ts";
import { handleWebsocketConnection } from "./handlerWs.ts";

const port = parseInt(Deno.env.get("PORT") || "8000");

const requestHandler = createHandler(handlerHttp, handleWebsocketConnection);

Deno.serve({
  port,
  onError: (e: unknown) => {
    console.error(e);
    return Response.error();
  },
  onListen: ({ hostname, port }) => {
    console.log(`🚀🌙 Listening on hostname=${hostname} port=${port}`);
  },
}, requestHandler);
