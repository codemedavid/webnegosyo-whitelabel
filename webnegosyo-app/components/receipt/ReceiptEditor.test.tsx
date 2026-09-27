/**
 * The Receipt editor's two surfaces a merchant touches most: the paper, which
 * is how they pick a line to change, and the inspector, which is how they
 * change it. What matters is what a tap does and what a screen reader can
 * address — the paper itself is the engine's output, pinned in lib/.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ReceiptPaper } from "./ReceiptPaper";
import { BlockInspector, type BlockInspectorProps } from "./BlockInspector";
import { buildPreviewBlocks } from "../../lib/receipt-preview";
import { initialStudioState, layoutOf } from "../../lib/receipt-studio";

const CONFIG = { storeName: "Sukad", logoUrl: null, columns: 32 };

function previewOf(saved: unknown) {
  const { draft } = initialStudioState(saved);
  return { draft, blocks: buildPreviewBlocks(draft.drafts, layoutOf(draft), CONFIG) };
}

describe("ReceiptPaper", () => {
  it("selects the block whose line was tapped", () => {
    const { draft, blocks } = previewOf({ version: 1, blocks: [{ kind: "businessName" }, { kind: "items" }] });
    const onSelect = jest.fn();
    render(<ReceiptPaper blocks={blocks} columns={32} width={320} onSelectBlock={onSelect} />);

    fireEvent.press(screen.getByRole("button", { name: "Items. Tap to edit" }));

    expect(onSelect).toHaveBeenCalledWith(draft.drafts[1]!.id);
  });

  it("prints the store's own name from the engine", () => {
    const { blocks } = previewOf({ version: 1, blocks: [{ kind: "businessName" }] });
    render(<ReceiptPaper blocks={blocks} columns={32} width={320} onSelectBlock={() => {}} />);

    expect(screen.getByText(/SUKAD/i)).toBeTruthy();
  });

  it("marks the selected block and names it on the paper", () => {
    const { draft, blocks } = previewOf({ version: 1, blocks: [{ kind: "businessName" }, { kind: "totals" }] });
    render(
      <ReceiptPaper
        blocks={blocks}
        columns={32}
        width={320}
        selectedId={draft.drafts[1]!.id}
        onSelectBlock={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Totals. Tap to edit", selected: true })).toBeTruthy();
  });

  it("keeps a block that prints nothing findable, and says why", () => {
    const { blocks } = previewOf({ version: 1, blocks: [{ kind: "logo" }, { kind: "items" }] });
    render(<ReceiptPaper blocks={blocks} columns={32} width={320} onSelectBlock={() => {}} />);

    expect(screen.getByText("Store logo — No logo uploaded yet")).toBeTruthy();
  });

  it("offers nothing to tap as a thumbnail", () => {
    const { blocks } = previewOf("modern");
    render(<ReceiptPaper blocks={blocks} columns={32} width={120} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});

function renderInspector(overrides: Partial<BlockInspectorProps> = {}) {
  const props: BlockInspectorProps = {
    block: { kind: "orderNumber" },
    theme: "modern",
    columns: 32,
    isFirst: false,
    isLast: false,
    hasLogo: true,
    problem: null,
    onChange: jest.fn(),
    onMove: jest.fn(),
    onDuplicate: jest.fn(),
    onAddBelow: jest.fn(),
    onRemove: jest.fn(),
    onSplit: jest.fn(),
    onDone: jest.fn(),
    ...overrides,
  };
  render(<BlockInspector {...props} />);
  return props;
}

describe("BlockInspector", () => {
  it("renames a detail's printed label as one typing step", () => {
    const props = renderInspector();

    fireEvent.changeText(screen.getByLabelText("Printed label"), "Queue #");

    expect(props.onChange).toHaveBeenCalledWith({ kind: "orderNumber", label: "Queue #" }, "label");
  });

  it("goes back to the default label when the field is cleared", () => {
    const props = renderInspector({ block: { kind: "orderNumber", label: "Queue #" } });

    fireEvent.changeText(screen.getByLabelText("Printed label"), "");

    expect(props.onChange).toHaveBeenCalledWith({ kind: "orderNumber", label: undefined }, "label");
  });

  it("sets a size from the size track", () => {
    const props = renderInspector();

    fireEvent.press(screen.getByRole("radio", { name: "Large text" }));

    expect(props.onChange).toHaveBeenCalledWith({ kind: "orderNumber", style: { size: "large" } });
  });

  it("cannot move the top block further up", () => {
    const props = renderInspector({ isFirst: true });

    fireEvent.press(screen.getByRole("button", { name: "Up" }));
    fireEvent.press(screen.getByRole("button", { name: "Down" }));

    expect(props.onMove).toHaveBeenCalledTimes(1);
    expect(props.onMove).toHaveBeenCalledWith(1);
  });

  it("shows a publish refusal where the fix is", () => {
    renderInspector({
      block: { kind: "text", text: "" },
      problem: "This text block is empty. Type something or remove it.",
    });

    expect(screen.getByText("This text block is empty. Type something or remove it.")).toBeTruthy();
  });

  it("offers no text styling for a block that prints as it is", () => {
    renderInspector({ block: { kind: "qr" } });

    expect(screen.queryByRole("radiogroup", { name: "Text size" })).toBeNull();
    expect(screen.getByText(/scan it to follow their order/)).toBeTruthy();
  });

  it("warns when the logo block has no logo to print", () => {
    renderInspector({ block: { kind: "logo" }, hasLogo: false });

    expect(screen.getByText(/no logo yet/)).toBeTruthy();
  });

  it("splits all-in-one details on request", () => {
    const props = renderInspector({ block: { kind: "orderMeta" } });

    fireEvent.press(screen.getByText(/Split into 5 lines/));

    expect(props.onSplit).toHaveBeenCalledTimes(1);
  });
});
