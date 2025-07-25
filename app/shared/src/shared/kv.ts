import { ensureFileSync } from "std/fs";

let localkv: Deno.Kv | undefined = undefined;

export const getKv = async (): Promise<Deno.Kv> => {
  // console.log(`🔥 getKv DENO_KV_URL=${DENO_KV_URL}`);
  if (localkv === undefined) {
    const kvPath = Deno.env.get("DENO_KV_URL") || undefined;
    if (
      kvPath &&
      !kvPath?.startsWith("http")
    ) {
      ensureFileSync(kvPath);
    }

    console.log(`🔥 Opening kv at ${kvPath}`);
    const thiskv = await Deno.openKv(kvPath);
    if (localkv) {
      thiskv.close();
      return localkv;
    }
    localkv = thiskv;
    // console.log(`🗝️  DenoKv Connected${kvPath ? " [" + kvPath + "]" : ""} ✅`);
  }
  return localkv;
};
