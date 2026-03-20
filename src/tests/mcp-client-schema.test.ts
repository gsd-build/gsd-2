import test from "node:test";
import assert from "node:assert/strict";
import { Type } from "@sinclair/typebox";

test("mcp_call args schema uses additionalProperties instead of patternProperties", () => {
  const schema = Type.Object({
    server: Type.String(),
    tool: Type.String(),
    args: Type.Optional(
      Type.Object({}, {
        additionalProperties: true,
        description: "Tool arguments as key-value pairs matching the tool's input schema",
      }),
    ),
  });

  const argsSchema = (schema.properties as any).args;
  assert.equal(argsSchema.type, "object");
  assert.equal(argsSchema.additionalProperties, true);
  assert.ok(!("patternProperties" in argsSchema));
});
