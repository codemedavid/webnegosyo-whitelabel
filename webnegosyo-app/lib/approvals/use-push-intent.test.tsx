import { act, renderHook } from "@testing-library/react-native";

import type { ApprovalIntent } from "./push-route";
import { usePushIntent } from "./use-push-intent";

interface Props {
  approvalId: string | null;
  intentParam: ApprovalIntent | null;
}

function setup(initial: Props) {
  const clearParam = jest.fn();
  const hook = renderHook((props: Props) => usePushIntent(props.approvalId, props.intentParam, clearParam), {
    initialProps: initial,
  });
  return { ...hook, clearParam };
}

describe("usePushIntent", () => {
  it("carries a push's intent for the request it was sent for and clears the route param", () => {
    const { result, clearParam } = setup({ approvalId: "a", intentParam: "approve" });

    expect(result.current.intent).toBe("approve");
    expect(result.current.at).not.toBeNull();
    expect(clearParam).toHaveBeenCalledTimes(1);
  });

  it("has no intent when the request was opened without a push", () => {
    const { result } = setup({ approvalId: "a", intentParam: null });

    expect(result.current).toEqual({ intent: null, at: null });
  });

  it("forgets a push's intent once another request is opened, so reopening the first never auto-approves", () => {
    const { result, rerender } = setup({ approvalId: "a", intentParam: "approve" });
    // The param is consumed (cleared) after the push.
    act(() => rerender({ approvalId: "a", intentParam: null }));
    expect(result.current.intent).toBe("approve");

    act(() => rerender({ approvalId: "b", intentParam: null }));
    expect(result.current.intent).toBeNull();

    act(() => rerender({ approvalId: "a", intentParam: null }));
    expect(result.current).toEqual({ intent: null, at: null });
  });

  it("takes a new push for the same request as a fresh intent", () => {
    const { result, rerender } = setup({ approvalId: "a", intentParam: "approve" });
    act(() => rerender({ approvalId: "a", intentParam: null }));
    const firstAt = result.current.at;

    act(() => rerender({ approvalId: "a", intentParam: "decline" }));

    expect(result.current.intent).toBe("decline");
    expect(result.current.at).not.toBeNull();
    expect(result.current.at).toBeGreaterThanOrEqual(firstAt ?? 0);
  });
});
