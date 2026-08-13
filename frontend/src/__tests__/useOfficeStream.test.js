import { beforeEach, describe, expect, it, vi } from "vitest";

let cleanupEffect;
let mockState;
let mockActions;

vi.mock("react", () => ({
  useEffect: (effect) => {
    cleanupEffect = effect();
  },
  useRef: (initialValue) => ({ current: initialValue }),
}));

vi.mock("@/utils/request", () => ({
  baseHeaders: () => ({ Authorization: "Bearer token" }),
}));

vi.mock("@/store/officeStore", () => ({
  useOfficeStore: Object.assign((selector) => selector(mockState), {
    getState: () => mockActions,
  }),
}));

const fetchEventSourceMock = vi.fn((_url, options) => {
  try {
    options.onerror(new TypeError("network error"));
  } catch (error) {
    return Promise.reject(error);
  }
  return Promise.resolve();
});

vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: fetchEventSourceMock,
}));

describe("useOfficeStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanupEffect = undefined;
    fetchEventSourceMock.mockClear();
    mockState = { connectVersion: 0 };
    mockActions = {
      setConnectionStatus: vi.fn(),
      setReconnectAttempt: vi.fn(),
      applySnapshot: vi.fn(),
      updateActor: vi.fn(),
      addActor: vi.fn(),
      beginRemoveActor: vi.fn(),
      updateLinks: vi.fn(),
    };
  });

  it("handles transient stream errors without surfacing an unhandled rejection", async () => {
    const { default: useOfficeStream } =
      await import("@/hooks/useOfficeStream");

    useOfficeStream();
    await Promise.resolve();

    expect(fetchEventSourceMock).toHaveBeenCalledTimes(1);
    expect(mockActions.setConnectionStatus).toHaveBeenLastCalledWith(
      "connecting"
    );
    expect(mockActions.setReconnectAttempt).toHaveBeenCalledWith(1);

    cleanupEffect?.();
    vi.useRealTimers();
  });
});
