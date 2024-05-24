const DENO_KV_URL = Deno.env.get("DENO_KV_URL");
let localkv: Deno.Kv | undefined = undefined;

export const getKv = async (): Promise<Deno.Kv> => {
  if (localkv === undefined) {
    const thiskv = await Deno.openKv(DENO_KV_URL ? DENO_KV_URL : undefined);
    if (localkv) {
      thiskv.close();
      return localkv;
    }
    localkv = thiskv;
    console.log(`🗝️  ✅ DenoKv Connected ${DENO_KV_URL || "" }`);
  }
  return localkv;
};


