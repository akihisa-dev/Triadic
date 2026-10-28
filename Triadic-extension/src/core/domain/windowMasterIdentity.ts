import type { PlanCommand } from "./planCommands";
import type { PlanContents } from "./plan";

/** Session-only generations distinguish a normal edit from deletion followed by ID reuse. */
export class WindowMasterIdentity {
  private sequence = 0;
  private current: Record<string, number> = {};
  sync(contents: PlanContents): Record<string, number> {
    const keys = [
      ...contents.accounts.map(row => `account:${row.id}`),
      ...contents.aggregations.map(row => `aggregation:${row.id}`),
      ...contents.expansions.map(row => `expansion:${row.id}`),
      ...contents.periodTypes.map(row => `period:${row.id}`),
    ];
    if (keys.length === Object.keys(this.current).length && keys.every(key => this.current[key] !== undefined)) return this.current;
    this.current = Object.fromEntries(keys.map(key => [key, this.current[key] ?? ++this.sequence]));
    return this.current;
  }
}

export function windowMasterTargets(command: PlanCommand): string[] {
  if ((command.type === "expansion" || command.type === "period" || command.type === "aggregation") && command.change.type === "update") return [`${command.type}:${command.change.id}`];
  if (command.type === "aggregation" && command.change.type === "move") {
    const { member, parentId } = command.change;
    return [`${member.kind === "group" ? "aggregation" : "account"}:${member.id}`, ...(parentId === null ? [] : [`aggregation:${parentId}`])];
  }
  return [];
}
