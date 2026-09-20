import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  return {
    PanGestureHandler: ({ children, enabled }: { children: React.ReactNode; enabled: boolean }) => (
      <View testID={`pan-${enabled ? "enabled" : "disabled"}`}>{children}</View>
    ),
    State: { BEGAN: 2, ACTIVE: 4, END: 5, CANCELLED: 3, FAILED: 1 },
  };
});

import { Rect } from "react-native-svg";

import { TableNode } from "./TableNode";
import type { TableView } from "../../lib/tables/table-floor";

const CANVAS = { width: 400, height: 500 };
const MIN = 60_000;

function view(overrides: Partial<TableView> = {}): TableView {
  return {
    table: {
      id: "t1",
      tenantId: "tenant",
      outletId: null,
      label: "12",
      seats: 4,
      shape: "round",
      size: "md",
      zone: null,
      posX: 0.5,
      posY: 0.5,
      rotation: 0,
      sortOrder: 0,
      isActive: true,
    },
    seating: null,
    orders: [],
    status: "available",
    runningBill: 0,
    unpaidTotal: 0,
    covers: 0,
    seatedForMs: null,
    ...overrides,
  };
}

function renderNode(v: TableView, isEditing = false) {
  const onPress = jest.fn();
  const onMove = jest.fn();
  const onRotate = jest.fn();
  render(
    <TableNode
      view={v}
      canvas={CANVAS}
      position={{ x: v.table.posX, y: v.table.posY }}
      rotation={v.table.rotation}
      isEditing={isEditing}
      isDimmed={false}
      onPress={onPress}
      onMove={onMove}
      onRotate={onRotate}
    />,
  );
  return { onPress, onMove, onRotate };
}

describe("TableNode", () => {
  it("shows the label and the seats of an empty table", () => {
    renderNode(view());
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("4 seats")).toBeTruthy();
    expect(screen.getByLabelText("Table 12, available, seats 4")).toBeTruthy();
  });

  it("shows the party, the timer and the bill of a seated table", () => {
    renderNode(
      view({
        status: "ordered",
        seating: { id: "s1", tableId: "t1", partySize: 3, seatedAt: 0, note: null },
        covers: 3,
        seatedForMs: 42 * MIN,
        runningBill: 1250,
        orders: [{ _id: "o1", _creationTime: 0, status: "confirmed", total: 1250 }],
      }),
    );
    expect(screen.getByText("3/4")).toBeTruthy();
    expect(screen.getByText("42m")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByLabelText("Table 12, ordered, 3 guests, seated 42m, 1 order")).toBeTruthy();
  });

  it("opens the table on tap", () => {
    const v = view();
    const { onPress } = renderNode(v);
    fireEvent.press(screen.getByTestId("table-node-t1"));
    expect(onPress).toHaveBeenCalledWith(v);
  });

  it("only drags in edit mode", () => {
    renderNode(view());
    expect(screen.getByTestId("pan-disabled")).toBeTruthy();
  });

  it("drags in edit mode and says so", () => {
    renderNode(view(), true);
    expect(screen.getByTestId("pan-enabled")).toBeTruthy();
    expect(screen.getByHintText("Drag to move, tap to edit")).toBeTruthy();
  });

  it("offers the turn handle only while the layout is being edited", () => {
    renderNode(view());
    expect(screen.queryByTestId("table-rotate-t1")).toBeNull();
  });

  it("turns the table from the handle", () => {
    // Arrange
    const v = view();
    const { onRotate } = renderNode(v, true);

    // Act
    fireEvent.press(screen.getByTestId("table-rotate-t1"));

    // Assert
    expect(onRotate).toHaveBeenCalledWith(v);
  });

  it("draws a chair for every seat at the table", () => {
    const { UNSAFE_root } = render(
      <TableNode
        view={view({ table: { ...view().table, seats: 6, shape: "rect" } })}
        canvas={CANVAS}
        position={{ x: 0.5, y: 0.5 }}
        rotation={0}
        isEditing={false}
        isDimmed={false}
        onPress={jest.fn()}
        onMove={jest.fn()}
      />,
    );
    // Two rects per chair (back and seat) plus the rounded top's own shapes.
    expect(UNSAFE_root.findAllByType(Rect).length).toBeGreaterThanOrEqual(12);
  });
});
