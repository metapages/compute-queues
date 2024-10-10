import { assertExists } from '@std/assert';

import { convertJobOutputDataRefsToExpectedFormat } from './dataref.ts';

Deno.test("test something", () => {

  console.log("test something",convertJobOutputDataRefsToExpectedFormat);
  assertExists(convertJobOutputDataRefsToExpectedFormat);
});
