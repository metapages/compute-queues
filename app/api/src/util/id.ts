import { cryptoRandomString } from "crypto-random-string";

export const SERVER_INSTANCE_ID_LENGTH = 6;

export const SERVER_INSTANCE_ID = cryptoRandomString({
  length: SERVER_INSTANCE_ID_LENGTH,
  type: "alphanumeric",
});
