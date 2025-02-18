import { ensureFileSync } from "std/fs";

const DENO_KV_URL = Deno.env.get("DENO_KV_URL");
let localkv: Deno.Kv | undefined = undefined;

export const getKv = async (): Promise<Deno.Kv> => {
  if (localkv === undefined) {
    const kvPath = DENO_KV_URL || undefined;
    if (
      kvPath &&
      !kvPath?.startsWith("http")
    ) {
      ensureFileSync(kvPath);
    }

    const thiskv = await Deno.openKv(kvPath);
    if (localkv) {
      thiskv.close();
      return localkv;
    }
    localkv = thiskv;
    console.log(`🗝️  DenoKv Connected${kvPath ? " [" + kvPath + "]" : ""} ✅`);
  }
  return localkv;
};
