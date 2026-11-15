import { startChatOrder, type AlertButton, type ChatOrderRegister, type StartChatOrderDeps } from "./start-chat-order";

const ANA = { sessionId: "s1", name: "Ana C.", firstName: "Ana", lastName: "Cruz" };

function harness(options: { lines?: number; isEditing?: boolean; needsBranch?: boolean } = {}) {
  const calls: string[] = [];
  const alerts: Array<{ title: string; buttons: AlertButton[] }> = [];
  const register: ChatOrderRegister = {
    lines: Array.from({ length: options.lines ?? 0 }),
    editContext: options.isEditing ? {} : null,
    reset: () => calls.push("reset"),
    setChat: (chat) => calls.push(`chat:${chat.sessionId}:${chat.name}`),
    setCustomerName: (name) => calls.push(`name:${name}`),
  };
  const deps: StartChatOrderDeps = {
    register: () => register,
    needsBranch: () => options.needsBranch ?? false,
    alert: (title, _message, buttons) => alerts.push({ title, buttons }),
    navigate: (href) => calls.push(`go:${href}`),
  };
  const press = (title: string, text: string) => alerts.find((a) => a.title === title)?.buttons.find((b) => b.text === text)?.onPress?.();
  return { deps, calls, alerts, press };
}

describe("startChatOrder", () => {
  it("opens the register for this customer with their Facebook name", () => {
    const h = harness();
    startChatOrder(ANA, h.deps);
    expect(h.calls).toEqual(["reset", "chat:s1:Ana C.", "name:Ana Cruz", "go:/(main)/pos"]);
    expect(h.alerts).toEqual([]);
  });

  it("leaves the name blank when Meta gave none", () => {
    const h = harness();
    startChatOrder({ ...ANA, firstName: null, lastName: null }, h.deps);
    expect(h.calls).toEqual(["reset", "chat:s1:Ana C.", "go:/(main)/pos"]);
  });

  it("asks which branch first, keeping the order ready on the register", () => {
    const h = harness({ needsBranch: true });
    startChatOrder(ANA, h.deps);
    expect(h.calls).toEqual([]);
    h.press("Which branch is this order for?", "Choose branch");
    expect(h.calls).toEqual(["reset", "chat:s1:Ana C.", "name:Ana Cruz", "go:/(main)/portfolio"]);
  });

  it("asks before replacing a sale (or an edit) on the counter, and changes nothing until then", () => {
    for (const options of [{ lines: 1 }, { isEditing: true }]) {
      const h = harness(options);
      startChatOrder(ANA, h.deps);
      expect(h.calls).toEqual([]);
      h.press("Clear the register?", "Start this order");
      expect(h.calls.at(-1)).toBe("go:/(main)/pos");
    }
  });

  it("a replaced sale still asks for the branch when the store needs one", () => {
    const h = harness({ lines: 2, needsBranch: true });
    startChatOrder(ANA, h.deps);
    h.press("Clear the register?", "Start this order");
    expect(h.alerts.map((a) => a.title)).toEqual(["Clear the register?", "Which branch is this order for?"]);
    expect(h.calls).toEqual([]);
  });
});
