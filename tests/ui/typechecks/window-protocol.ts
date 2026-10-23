import { hubRequest, type HubCall, type HubRequest } from "../../../Triadichrome-extension/src/extension/windowProtocol";
import type { PlanContents } from "../../../Triadichrome-extension/src/core/domain/plan";

export async function windowProtocolTypeChecks(call: HubCall) {
  const request: HubRequest = hubRequest(1, "preview", 1);
  const contents: PlanContents = await call("preview", request.id);
  // @ts-expect-error Operation misspellings must be rejected.
  hubRequest(2, "disptach", 123, "wrong");
  // @ts-expect-error The operation fixes the argument tuple.
  hubRequest(3, "dispatch", 123, "wrong");
  // @ts-expect-error Direct wire requests retain the method/argument relationship.
  const malformed: HubRequest = { type: "request", id: 4, method: "preview", args: ["wrong"] };
  // @ts-expect-error The caller cannot choose an arbitrary return type.
  const wrong: string = await call("preview", 1);
  return { contents, malformed, wrong };
}
