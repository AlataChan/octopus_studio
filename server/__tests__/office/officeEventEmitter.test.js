const { officeEventEmitter } = require("../../utils/office/officeEventEmitter");

describe("OfficeEventEmitter", () => {
  afterEach(() => {
    officeEventEmitter.removeAllListeners();
  });

  it("emits events to subscribers", (done) => {
    officeEventEmitter.subscribe((eventName, data) => {
      expect(eventName).toBe("office.actor.updated");
      expect(data.actorId).toBe("a1");
      done();
    });
    officeEventEmitter.emit("office.actor.updated", {
      actorId: "a1",
      patch: { status: "thinking" },
    });
  });

  it("supports multiple subscribers", () => {
    const received = [];
    officeEventEmitter.subscribe((e, d) => received.push({ handler: 1, e, d }));
    officeEventEmitter.subscribe((e, d) => received.push({ handler: 2, e, d }));
    officeEventEmitter.emit("ping", { timestamp: 123 });
    expect(received).toHaveLength(2);
  });

  it("unsubscribe removes handler", () => {
    const received = [];
    const handler = (e, d) => received.push(d);
    officeEventEmitter.subscribe(handler);
    officeEventEmitter.unsubscribe(handler);
    officeEventEmitter.emit("ping", {});
    expect(received).toHaveLength(0);
  });
});
