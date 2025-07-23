import { cryptoRandomString } from "crypto-random-string";

const SERVER_ID_FROM_ENV_VAR: string | undefined = Deno.env.get("METAPAGE_IO_SERVER_ID");

export const SERVER_INSTANCE_ID_LENGTH = 6;

export const SERVER_INSTANCE_ID = SERVER_ID_FROM_ENV_VAR || cryptoRandomString({
  length: SERVER_INSTANCE_ID_LENGTH,
  type: "alphanumeric",
});
