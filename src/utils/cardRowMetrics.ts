/** Prefix sums of row heights, including the gap after each row. */
export class CardRowMetrics {
  // Fenwick tree with spare capacity; only nodes 1..length are meaningful.
  private tree = new Float64Array(1)
  private heights: number[] = []

  get length() {
    return this.heights.length
  }

  /** Sum of every row, i.e. the column/list total. */
  get total() {
    return this.offset(this.heights.length)
  }

  reset(heights: number[]) {
    this.heights = heights
    this.tree = new Float64Array(heights.length + 1)
    for (let index = 1; index <= heights.length; index++) {
      this.tree[index] += heights[index - 1]
      const parent = index + (index & -index)
      if (parent <= heights.length)
        this.tree[parent] += this.tree[index]
    }
  }

  /**
   * Extend a stable prefix. Each new node covers (index - lowbit, index], so
   * it aggregates the existing child nodes in that range, not only its row.
   */
  append(heights: readonly number[]) {
    const start = this.heights.length
    const size = start + heights.length
    if (size + 1 > this.tree.length) {
      const grown = new Float64Array(Math.max(size + 1, this.tree.length * 2))
      grown.set(this.tree.subarray(0, start + 1))
      this.tree = grown
    }
    for (let offset = 0; offset < heights.length; offset++) {
      const index = start + offset + 1
      this.heights.push(heights[offset])
      let sum = heights[offset]
      const covered = index - (index & -index)
      for (let child = index - 1; child > covered; child -= child & -child)
        sum += this.tree[child]
      this.tree[index] = sum
    }
  }

  /**
   * Drop rows from `rows` on. Node i only covers rows up to i, so the nodes
   * of the kept prefix stay exact without any recomputation.
   */
  truncate(rows: number) {
    if (rows < this.heights.length)
      this.heights.length = Math.max(0, rows)
  }

  set(row: number, height: number): boolean {
    const previous = this.heights[row]
    if (previous === undefined || Math.abs(previous - height) < 0.5)
      return false
    this.heights[row] = height
    for (let index = row + 1; index <= this.heights.length; index += index & -index)
      this.tree[index] += height - previous
    return true
  }

  offset(row: number): number {
    let result = 0
    for (let index = Math.min(row, this.heights.length); index > 0; index -= index & -index)
      result += this.tree[index]
    return result
  }

  /** Find a row in O(log n), without scanning the previously loaded feed. */
  rowAt(offset: number): number {
    let row = 0
    let sum = 0
    let step = 1
    while (step * 2 <= this.heights.length)
      step *= 2
    for (; step > 0; step = Math.floor(step / 2)) {
      const next = row + step
      if (next <= this.heights.length && sum + this.tree[next] <= offset) {
        row = next
        sum += this.tree[next]
      }
    }
    return Math.min(row, Math.max(0, this.heights.length - 1))
  }
}
