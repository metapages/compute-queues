const DENO_KV_URL = Deno.env.get("DENO_KV_URL");
let localkv: Deno.Kv | undefined = undefined;

export const getKv = async (): Promise<Deno.Kv> => {
  if (localkv === undefined) {
    const kvUrl = DENO_KV_URL || undefined;
    const thiskv = await Deno.openKv(kvUrl);
    if (localkv) {
      thiskv.close();
      return localkv;
    }
    localkv = thiskv;
    console.log(`🗝️  DenoKv Connected${kvUrl ? " [" + kvUrl + "]" : ""} ✅`);
  }
  return localkv;
};
