import { getMetaframeKey } from "../../../../api/functions/_lib/shared/url.ts";
import { fetchGetPublicMetaframe } from "../db/gql.ts";
import { RequestContext } from "../types.ts";

export const resolveMetaframeUrl = async (
  originalUrl: string,
  context: RequestContext,
): Promise<string> => {
  let returnUrl = originalUrl;
  const mfk = getMetaframeKey(originalUrl);

  if (mfk) {
    const resultsMetaframe = await fetchGetPublicMetaframe(
      context.graphql.url,
      {
        "x-hasura-admin-secret": context.graphql.secret,
      },
      { mfk },
    );

    const metaframeUrl = resultsMetaframe?.data?.metaframes?.[0]?.url;
    if (metaframeUrl) {
      const metaframeDefinition = resultsMetaframe?.data?.metaframes?.[0]
        ?.definitions?.[0];
      const hash = metaframeDefinition?.value?.hash;
      const finalUrl = metaframeUrl + (hash || "");
      return finalUrl;
    }
  }
  return returnUrl;
};
