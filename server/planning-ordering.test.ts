import { describe, expect, it } from "vitest";
import { SupabasePersonalPlanningAdapter } from "./adapters/supabase/planning.js";
import {
  completedAtFor,
  decodeKeysetCursor,
  encodeKeysetCursor,
  nextKeysetCursor,
} from "./ordering.js";
import { personalTaskListSchema } from "./kanban-service.js";

type Row = Record<string, unknown>;

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";
const context = { workspaceId, userId, role: "agent" as const };
const uuid = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

/** Minimal in-memory PostgREST stand-in that honours the default 1000-row cap. */
class FakeDb {
  readonly orFilters: string[] = [];
  readonly updates: Row[] = [];
  constructor(public tasks: Row[]) {}
  from(table: string) {
    if (table !== "personal_tasks") throw new Error(`unexpected ${table}`);
    return new Query(this);
  }
}

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private orders: string[] = [];
  private patch?: Row;
  private single = false;
  private window: [number, number] | undefined;
  private max: number | undefined;
  constructor(private readonly db: FakeDb) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  or(value: string) {
    this.db.orFilters.push(value);
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push(
      `${column}:${options.ascending === false ? "desc" : "asc"}`,
    );
    return this;
  }
  range(from: number, to: number) {
    this.window = [from, to];
    return this;
  }
  limit(value: number) {
    this.max = value;
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then<T, U>(
    ok?: ((value: { data: unknown; error: null }) => T | PromiseLike<T>) | null,
    bad?: ((reason: unknown) => U | PromiseLike<U>) | null,
  ) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
  private run() {
    let selected = this.db.tasks.filter((row) =>
      this.filters.every((test) => test(row)),
    );
    if (this.patch) {
      this.db.updates.push({ ...this.patch });
      for (const row of selected) Object.assign(row, this.patch);
    }
    for (const spec of [...this.orders].reverse()) {
      const [column, direction] = spec.split(":");
      selected = [...selected].sort((a, b) => {
        const left = a[column!] as string | number;
        const right = b[column!] as string | number;
        const result = left < right ? -1 : left > right ? 1 : 0;
        return direction === "desc" ? -result : result;
      });
    }
    const [from, to] = this.window ?? [0, Number.POSITIVE_INFINITY];
    selected = selected.slice(from, Math.min(to + 1, from + 1000));
    if (this.max !== undefined) selected = selected.slice(0, this.max);
    return {
      data: this.single ? (selected[0] ?? null) : selected,
      error: null,
    };
  }
}

function task(index: number, position: number, extra: Row = {}): Row {
  return {
    id: uuid(index),
    workspace_id: workspaceId,
    user_id: userId,
    title: `Task ${index}`,
    status: "todo",
    kanban_position: position,
    completed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

const adapter = (db: FakeDb) =>
  new SupabasePersonalPlanningAdapter(db as never);

describe("kanban ordering", () => {
  it("renumbers when the rounded midpoint would duplicate a neighbour", async () => {
    // Gap of exactly 0.000001: the midpoint rounds onto the upper neighbour.
    const db = new FakeDb([
      task(1, 1000),
      task(2, 1000.000001),
      task(3, 5000, { status: "in_progress" }),
    ]);
    const moved = await adapter(db).moveTask(context, uuid(3), {
      status: "todo",
      beforeId: uuid(1),
      afterId: uuid(2),
    });
    const positions = db.tasks
      .filter((row) => row.status === "todo")
      .map((row) => Number(row.kanban_position));
    expect(new Set(positions).size).toBe(3);
    const byId = Object.fromEntries(
      db.tasks.map((row) => [row.id, Number(row.kanban_position)]),
    );
    expect(byId[uuid(1)]!).toBeLessThan(byId[uuid(3)]!);
    expect(byId[uuid(3)]!).toBeLessThan(byId[uuid(2)]!);
    expect(moved?.kanbanPosition).toBe(byId[uuid(3)]);
  });

  it("keeps the plain midpoint when it fits between neighbours", async () => {
    const db = new FakeDb([task(1, 1000), task(2, 1000.000004), task(3, 5000)]);
    const moved = await adapter(db).moveTask(context, uuid(3), {
      status: "todo",
      beforeId: uuid(1),
      afterId: uuid(2),
    });
    expect(moved?.kanbanPosition).toBe(1000.000002);
    expect(db.updates).toHaveLength(1);
  });

  it("rebalances every card of a column, not just the first 1000", async () => {
    const tasks: Row[] = [];
    for (let index = 1; index <= 2500; index++)
      tasks.push(task(index, 100 + index * 0.000001));
    tasks.push(task(9000, 1, { status: "in_progress" }));
    const db = new FakeDb(tasks);
    await adapter(db).moveTask(context, uuid(9000), {
      status: "todo",
      beforeId: uuid(1),
      afterId: uuid(2),
    });
    const todo = db.tasks.filter((row) => row.status === "todo");
    expect(todo).toHaveLength(2501);
    expect(new Set(todo.map((row) => row.kanban_position)).size).toBe(2501);
    const last = db.tasks.find((row) => row.id === uuid(2500));
    expect(Number(last?.kanban_position)).toBeGreaterThanOrEqual(2500 * 1024);
  });

  it("keeps the original completed_at when reordering inside done", async () => {
    const db = new FakeDb([
      task(1, 1000, {
        status: "done",
        completed_at: "2026-02-02T00:00:00.000Z",
      }),
      task(2, 2000, {
        status: "done",
        completed_at: "2026-02-03T00:00:00.000Z",
      }),
      task(3, 3000, { status: "todo" }),
    ]);
    const service = adapter(db);
    await service.moveTask(context, uuid(1), {
      status: "done",
      afterId: null,
      beforeId: uuid(2),
    });
    expect(db.tasks[0]?.completed_at).toBe("2026-02-02T00:00:00.000Z");
    await service.updateTask(context, uuid(2), { status: "done" });
    expect(db.tasks[1]?.completed_at).toBe("2026-02-03T00:00:00.000Z");
    await service.moveTask(context, uuid(3), { status: "done" });
    expect(db.tasks[2]?.completed_at).toEqual(expect.any(String));
    await service.updateTask(context, uuid(3), { status: "todo" });
    expect(db.tasks[2]?.completed_at).toBeNull();
  });
});

describe("keyset cursors", () => {
  it("round-trips compound cursors and recognises legacy ids", () => {
    const cursor = encodeKeysetCursor(2048.5, uuid(7));
    expect(decodeKeysetCursor(cursor)).toEqual({
      kind: "keyset",
      key: 2048.5,
      id: uuid(7),
    });
    expect(decodeKeysetCursor(uuid(7))).toEqual({
      kind: "legacy",
      id: uuid(7),
    });
    expect(decodeKeysetCursor("not-a-cursor")).toBeNull();
    expect(personalTaskListSchema.safeParse({ cursor: "nope" }).success).toBe(
      false,
    );
    expect(personalTaskListSchema.safeParse({ cursor }).success).toBe(true);
  });

  it("exposes a next cursor only for full pages", () => {
    const items = [{ id: uuid(1), kanbanPosition: 5 }];
    expect(
      nextKeysetCursor(items, 1, (item) => item.kanbanPosition as number),
    ).toBe(encodeKeysetCursor(5, uuid(1)));
    expect(
      nextKeysetCursor(items, 2, (item) => item.kanbanPosition as number),
    ).toBeUndefined();
  });

  it("pages personal tasks by (position, id) so equal positions are not skipped", async () => {
    const db = new FakeDb([task(1, 10), task(2, 10), task(3, 20)]);
    const first = await adapter(db).listTasks(context, { limit: 1 });
    expect(first.map((item) => item.id)).toEqual([uuid(1)]);
    await adapter(db).listTasks(context, {
      limit: 1,
      cursor: encodeKeysetCursor(10, uuid(1)),
    });
    expect(db.orFilters).toEqual([
      `kanban_position.gt.10,and(kanban_position.eq.10,id.gt.${uuid(1)})`,
    ]);
    // Legacy bare id: the anchor row supplies the position.
    await adapter(db).listTasks(context, { limit: 1, cursor: uuid(2) });
    expect(db.orFilters[1]).toBe(
      `kanban_position.gt.10,and(kanban_position.eq.10,id.gt.${uuid(2)})`,
    );
  });
});

describe("completedAtFor", () => {
  it("sets on entry, keeps when already done, clears on exit", () => {
    const now = "2026-10-26T00:00:00.000Z";
    expect(completedAtFor("done", { status: "todo" }, now)).toBe(now);
    expect(
      completedAtFor(
        "done",
        { status: "done", completed_at: "2026-01-01T00:00:00.000Z" },
        now,
      ),
    ).toBe("2026-01-01T00:00:00.000Z");
    expect(completedAtFor("done", { status: "done" }, now)).toBe(now);
    expect(completedAtFor("todo", { status: "done" }, now)).toBeNull();
  });
});
