import { describe, expect, it } from "vitest";
import {
  extractActorMonogram,
  getActorAvatarPresentation,
  getActorVisualProfile,
} from "@/utils/office/actorVisualProfile";

describe("actorVisualProfile", () => {
  it("builds a stable visual profile for the same actor", () => {
    const actor = {
      id: "assistant-7",
      name: "露娜 Luna",
      status: "speaking",
    };

    const first = getActorVisualProfile(actor);
    const second = getActorVisualProfile(actor);

    expect(first.variantKey).toBe(second.variantKey);
    expect(first.body).toBe(second.body);
    expect(first.signal).toBe(second.signal);
    expect(first.monogram).toBe("露L");
  });

  it("maps actor status into the calm status palette", () => {
    expect(
      getActorVisualProfile({ id: "a", name: "Agent", status: "idle" }).signal
    ).toBe("#3dd68c");
    expect(
      getActorVisualProfile({ id: "a", name: "Agent", status: "tool_calling" })
        .signal
    ).toBe("#ffb27d");
    expect(
      getActorVisualProfile({ id: "a", name: "Agent", status: "error" }).signal
    ).toBe("#f26d63");
  });

  it("extracts readable monograms for chinese and latin names", () => {
    expect(extractActorMonogram("露娜 Luna")).toBe("露L");
    expect(extractActorMonogram("Clara Vision")).toBe("CV");
    expect(extractActorMonogram("AI")).toBe("AI");
  });

  it("prefers the stored system avatar and falls back to monogram only when missing", () => {
    expect(
      getActorAvatarPresentation({
        id: "assistant-1",
        name: "露娜 Luna",
        avatar: "/ai-employees/luna.jpg",
      })
    ).toEqual({
      kind: "image",
      value: "/ai-employees/luna.jpg",
      monogram: "露L",
    });

    expect(
      getActorAvatarPresentation({
        id: "assistant-2",
        name: "法务助手",
        avatar: null,
      })
    ).toEqual({
      kind: "monogram",
      value: "法",
      monogram: "法",
    });
  });

  it("resolves uploaded avatar filenames into assistant-library icon urls", () => {
    expect(
      getActorAvatarPresentation({
        id: "assistant-3",
        name: "法务助手",
        avatar: "4250b776-189a-4f31-a7c7-e41b9db04a1c.jpeg",
      })
    ).toEqual({
      kind: "image",
      value:
        "/api/assistant-library/icon/4250b776-189a-4f31-a7c7-e41b9db04a1c.jpeg",
      monogram: "法",
    });
  });
});
