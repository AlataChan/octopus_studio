const { MessageQueue } = require("../../../utils/imGateway/queue/MessageQueue");

describe("MessageQueue", () => {
  test("respects concurrency", async () => {
    let running = 0;
    let peak = 0;

    const queue = new MessageQueue({
      concurrency: 2,
      handler: async (value) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 20));
        running -= 1;
        return value * 2;
      },
    });

    const results = await Promise.all([
      queue.push(1),
      queue.push(2),
      queue.push(3),
      queue.push(4),
    ]);

    expect(results).toEqual([2, 4, 6, 8]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(queue.idle).toBe(true);
  });
});
