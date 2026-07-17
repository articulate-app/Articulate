import { describe, expect, it } from "vitest"
import {
  compareTaskChannelComponentOrder,
  sortTaskChannelComponentsByPosition,
} from "../features/tasks/utils/task-channel-component-order"

describe("task channel component order", () => {
  it("sorts position ASC with nulls last, then stable id", () => {
    const rows = [
      { task_component_id: "c", position: null },
      { task_component_id: "b", position: 2 },
      { task_component_id: "a", position: 1 },
      { task_component_id: "d", position: null },
      { task_component_id: "e", position: 1 },
    ]
    expect(sortTaskChannelComponentsByPosition(rows).map((row) => row.task_component_id)).toEqual([
      "a",
      "e",
      "b",
      "c",
      "d",
    ])
  })

  it("does not treat null position as zero", () => {
    expect(
      compareTaskChannelComponentOrder(
        { task_component_id: "nullish", position: null },
        { task_component_id: "zero", position: 0 },
      ),
    ).toBeGreaterThan(0)
  })
})
