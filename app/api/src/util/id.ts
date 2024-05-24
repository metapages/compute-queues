import {
  cryptoRandomString,
} from 'https://deno.land/x/crypto_random_string@1.0.0/mod.ts';

export const SERVER_INSTANCE_ID_LENGTH = 6;

export const SERVER_INSTANCE_ID = cryptoRandomString({
  length: SERVER_INSTANCE_ID_LENGTH,
  type: "alphanumeric",
});
