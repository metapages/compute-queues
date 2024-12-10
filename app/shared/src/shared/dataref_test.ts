import { assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { convertJobOutputDataRefsToExpectedFormat } from "./dataref.ts";

Deno.test("test something", () => {
  console.log("test something", convertJobOutputDataRefsToExpectedFormat);
  assertExists(convertJobOutputDataRefsToExpectedFormat);
});
