import React, { useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";

import { radius } from "../../theme/colors";
import type { TableView } from "../../lib/tables/table-floor";
import {
  FLOOR_ASPECT,
  GRID_STEP,
  type CanvasSize,
  type PositionMove,
  type TablePlacement,
} from "../../lib/tables/floor-layout";
import { floor } from "./floor-tokens";
import { TableNode } from "./TableNode";

interface FloorCanvasProps {
  views: readonly TableView[];
  /** Overrides the stored position and turn while a layout edit is unsaved. */
  placementOf: (view: TableView) => TablePlacement;
  isEditing: boolean;
  /** Which nodes the current filter keeps bright; others dim. */
  isHighlighted: (view: TableView) => boolean;
  onPressTable: (view: TableView) => void;
  onMoveTable: (move: PositionMove) => void;
  /** Turn a table a quarter; only wired while the layout is being edited. */
  onRotateTable?: (view: TableView) => void;
  /** Cap on the canvas width so a tablet does not draw a two-foot floor. */
  maxWidth?: number;
}

const DEFAULT_MAX_WIDTH = 640;
const GRID_DOT_RADIUS = 1.2;

/**
 * The floor: a portrait canvas with a dotted grid, and a node per table.
 * Its size comes from the layout it is given, so positions (fractions of the
 * canvas) draw the same on any device.
 */
export function FloorCanvas({
  views,
  placementOf,
  isEditing,
  isHighlighted,
  onPressTable,
  onMoveTable,
  onRotateTable,
  maxWidth = DEFAULT_MAX_WIDTH,
}: FloorCanvasProps) {
  const [width, setWidth] = useState(0);
  const canvas = useMemo<CanvasSize>(
    () => ({ width, height: Math.round(width / FLOOR_ASPECT) }),
    [width],
  );
  const gridStep = canvas.width * GRID_STEP * 2;

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = Math.min(event.nativeEvent.layout.width, maxWidth);
    if (measured !== width) setWidth(measured);
  };

  return (
    <View style={styles.frame} onLayout={onLayout}>
      <View
        style={[
          styles.canvas,
          { width: canvas.width, height: canvas.height },
          isEditing && styles.canvasEditing,
        ]}
        testID="floor-canvas"
      >
        {canvas.width > 0 ? (
          <Svg width={canvas.width} height={canvas.height} style={StyleSheet.absoluteFill}>
            <Defs>
              <Pattern id="floor-grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
                <Circle
                  cx={gridStep / 2}
                  cy={gridStep / 2}
                  r={GRID_DOT_RADIUS}
                  fill={isEditing ? floor.gridEditing : floor.grid}
                />
              </Pattern>
            </Defs>
            <Rect width={canvas.width} height={canvas.height} fill="url(#floor-grid)" />
          </Svg>
        ) : null}
        {canvas.width > 0
          ? views.map((view) => {
              const placement = placementOf(view);
              return (
                <TableNode
                  key={view.table.id}
                  view={view}
                  canvas={canvas}
                  position={placement}
                  rotation={placement.rotation}
                  isEditing={isEditing}
                  isDimmed={!isHighlighted(view)}
                  onPress={onPressTable}
                  onMove={onMoveTable}
                  onRotate={onRotateTable}
                />
              );
            })
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center" },
  canvas: {
    backgroundColor: floor.canvas,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: floor.canvasEdge,
    overflow: "visible",
  },
  canvasEditing: {
    borderStyle: "dashed",
    borderColor: floor.gridEditing,
  },
});
