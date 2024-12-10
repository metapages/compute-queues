/*
The graphql queries are taken from the hasura web console.
*/

const fetchGraphQL = async (
  url: string,
  headers: Record<string, string>,
  operationsDoc: string,
  operationName: string,
  variables: Record<string, any>,
) => {
  return fetch(url, {
    method: "POST",
    redirect: "follow",
    headers,
    body: JSON.stringify({
      query: operationsDoc,
      variables,
      operationName,
    }),
  }).then(async (result) => {
    const textJson = await result.text();
    if (!textJson.startsWith("{")) {
      console.error(`fetchGraphQL error ${textJson}`);
    }
    return JSON.parse(textJson);
  });
};

const operationGetPublicMetapage = `
  query GetPublicMetapage($id: uuid!) {
    metapages(where: {public: {_eq: true}, deleted: {_eq: false}, id: {_eq: $id}}) {
      definition
    }
  }
`;

const operationGetPublicMetaframe = `
  query MetaframeGetPublic($mfk: String!) {
    metaframes(where: {key: {_eq: $mfk}, public: {_eq: true}, deleted: {_eq: false}}) {
      url
      definitions(limit: 1, order_by: {created_at: desc}, where: {deleted: {_eq: false}}) {
        value
      }
    }
  }
`;

export const fetchGetPublicMetapage = (
  url: string,
  headers: Record<string, string>,
  variables: { id: string },
) => {
  return fetchGraphQL(
    url,
    headers,
    operationGetPublicMetapage,
    "GetPublicMetapage",
    variables,
  );
};

export const fetchGetPublicMetaframe = (
  url: string,
  headers: Record<string, string>,
  variables: { mfk: string },
) => {
  return fetchGraphQL(
    url,
    headers,
    operationGetPublicMetaframe,
    "MetaframeGetPublic",
    variables,
  );
};
