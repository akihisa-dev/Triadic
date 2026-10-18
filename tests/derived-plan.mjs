export async function readDerivedPlan(api, bytes) {
  const contents = await api.readPlanContents(bytes);
  return { ...contents, details: api.buildDetails(contents) };
}
