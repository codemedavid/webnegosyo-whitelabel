import React, { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from "react-native-gesture-handler";

import { colors, radius, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { formatPesoCompact } from "../../lib/format";
import { formatSeatedFor } from "../../lib/tables/table-actions";
import { describeTable, seatsLabel } from "../../lib/tables/table-copy";
import type { Rotation, TableView } from "../../lib/tables/table-floor";
import { footprint, nodeFootprint, positionAfterDrag, toCanvas } from "../../lib/tables/floor-layout";
import type { CanvasSize, NormPoint, PositionMove } from "../../lib/tables/floor-layout";
import { floor, STATUS_TONES } from "./floor-tokens";
import { TableGraphic } from "./TableGraphic";

interface TableNodeProps {
  view: TableView;
  canvas: CanvasSize;
  /** Where the node draws — the stored position, or a pending move's. */
  position: NormPoint;
  /** The turn it draws at — likewise the stored one, or a pending move's. */
  rotation: Rotation;
  isEditing: boolean;
  /** Filtered-out nodes stay on the floor, dimmed, so nothing jumps. */
  isDimmed: boolean;
  onPress: (view: TableView) => void;
  onMove: (move: PositionMove) => void;
  /** Turn the table a quarter. Only offered while the layout is being edited. */
  onRotate?: (view: TableView) => void;
}

const LIFT_SCALE = 1.06;
const PRESS_SCALE = 0.97;
const PULSE_MS = 900;
const DRAG_MIN_DISTANCE = 4;
const DIMMED_OPACITY = 0.35;
const HALO_OF_BODY = 1.18;
const ROTATE_HANDLE_SIZE = 26;

/**
 * One table on the floor, drawn as the furniture it is: a wooden top with
 * its chairs pulled in around it, turned the way the room turns it. The node
 * carries the drag gesture and the numbers a host reads off a table — who is
 * sitting, for how long, what they owe — while every measurement comes from
 * lib/tables and every decision (state, timer, where a drag lands) with it.
 *
 * The node is positioned absolutely at its stored point and moved with an
 * Animated translation during a drag. On release the landing point is
 * snapped and reported up; the parent then re-renders the node at the new
 * stored point and the translation resets to zero.
 */
export const TableNode = memo(function TableNode({
  view,
  canvas,
  position,
  rotation,
  isEditing,
  isDimmed,
  onPress,
  onMove,
  onRotate,
}: TableNodeProps) {
  const { table, status } = view;
  const tone = STATUS_TONES[status];
  const body = useMemo(
    () => footprint(table.shape, table.size, canvas),
    [table.shape, table.size, canvas],
  );
  // The chairs and the table's turn are part of what it occupies, so the drag
  // is clamped by the whole node, never by the bare top.
  const fp = useMemo(
    () => nodeFootprint(table.shape, table.size, canvas, rotation),
    [table.shape, table.size, canvas, rotation],
  );
  const pixel = useMemo(() => toCanvas(position, canvas, fp), [position, canvas, fp]);
  const halo = Math.max(body.w, body.h) * HALO_OF_BODY;

  const pan = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  // A new stored position means the parent adopted the drag: draw from there.
  useEffect(() => {
    pan.setValue({ x: 0, y: 0 });
  }, [pan, position.x, position.y]);

  // A plate on the pass breathes until someone runs it.
  useEffect(() => {
    if (status !== "ready") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.2, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.9, duration: PULSE_MS, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, status]);

  const onGestureEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { translationX: pan.x, translationY: pan.y } }], {
        useNativeDriver: false,
      }),
    [pan],
  );

  const onHandlerStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    const { state, translationX, translationY } = event.nativeEvent;
    if (state === State.BEGAN || state === State.ACTIVE) {
      Animated.spring(scale, { toValue: LIFT_SCALE, useNativeDriver: false }).start();
      return;
    }
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start();
      if (state !== State.END) {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        return;
      }
      const landed = positionAfterDrag(position, { dx: translationX, dy: translationY }, canvas, fp);
      const landedPx = toCanvas(landed, canvas, fp);
      Animated.spring(pan, {
        toValue: { x: landedPx.left - pixel.left, y: landedPx.top - pixel.top },
        useNativeDriver: false,
        speed: 24,
        bounciness: 4,
      }).start(() => onMove({ id: table.id, posX: landed.x, posY: landed.y }));
    }
  };

  const figure = (
    <Animated.View
      style={[
        styles.node,
        { width: fp.w, height: fp.h },
        isDimmed && styles.dimmed,
        { transform: [{ scale }] },
      ]}
    >
      {status === "ready" ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              width: halo,
              height: halo,
              borderRadius: halo / 2,
              borderColor: tone.ring,
              opacity: pulse,
            },
          ]}
        />
      ) : null}

      <TableGraphic
        shape={table.shape}
        seats={table.seats}
        covers={view.covers}
        body={body}
        node={fp}
        rotation={rotation}
        tone={tone}
        isWashed={status !== "available"}
      />

      <View style={[styles.plate, { width: body.w, height: body.h }]} pointerEvents="none">
        <Text style={[styles.label, table.size === "sm" && styles.labelSmall]} numberOfLines={1}>
          {table.label}
        </Text>
        <Text style={[styles.meta, { color: tone.ink }]} numberOfLines={1}>
          {view.seating ? `${view.covers}/${table.seats}` : seatsLabel(table.seats)}
        </Text>
        {view.seatedForMs !== null ? (
          <Text style={[styles.timer, { color: tone.ink }]}>{formatSeatedFor(view.seatedForMs)}</Text>
        ) : null}
      </View>

      {view.runningBill > 0 ? (
        <View style={[styles.billPill, { backgroundColor: tone.ring }]} pointerEvents="none">
          <Text style={styles.billText}>{formatPesoCompact(view.runningBill)}</Text>
        </View>
      ) : null}
      {view.orders.length > 0 ? (
        <View style={[styles.countPill, { borderColor: tone.ring }]} pointerEvents="none">
          <Text style={[styles.countText, { color: tone.ink }]}>{view.orders.length}</Text>
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <PanGestureHandler
      enabled={isEditing}
      minDist={DRAG_MIN_DISTANCE}
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
    >
      <Animated.View
        style={[styles.anchor, { left: pixel.left, top: pixel.top, transform: pan.getTranslateTransform() }]}
      >
        <Pressable
          onPress={() => onPress(view)}
          onPressIn={() => Animated.spring(scale, { toValue: PRESS_SCALE, useNativeDriver: false }).start()}
          onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start()}
          accessibilityRole="button"
          accessibilityLabel={describeTable(view)}
          accessibilityHint={isEditing ? "Drag to move, tap to edit" : "Opens the table"}
          testID={`table-node-${table.id}`}
        >
          {figure}
        </Pressable>
        {isEditing && onRotate ? (
          <Pressable
            onPress={() => onRotate(view)}
            style={styles.rotateHandle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Turn table ${table.label}`}
            testID={`table-rotate-${table.id}`}
          >
            <Icon name="rotate" color={colors.textPrimary} size={15} />
          </Pressable>
        ) : null}
      </Animated.View>
    </PanGestureHandler>
  );
});

const styles = StyleSheet.create({
  anchor: { position: "absolute" },
  node: { alignItems: "center", justifyContent: "center" },
  dimmed: { opacity: DIMMED_OPACITY },
  halo: { position: "absolute", borderWidth: 3 },
  plate: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  label: {
    ...typography.title,
    color: floor.nodeInk,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  labelSmall: { fontSize: 18 },
  meta: { ...typography.small, fontWeight: "700", marginTop: 1, fontVariant: ["tabular-nums"] },
  timer: { ...typography.small, fontWeight: "600", marginTop: 1, fontVariant: ["tabular-nums"] },
  billPill: {
    position: "absolute",
    bottom: -6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  billText: { ...typography.small, fontWeight: "800", color: colors.textOnDark, fontVariant: ["tabular-nums"] },
  countPill: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    borderWidth: 2,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { ...typography.small, fontWeight: "800" },
  rotateHandle: {
    position: "absolute",
    top: -4,
    left: -4,
    width: ROTATE_HANDLE_SIZE,
    height: ROTATE_HANDLE_SIZE,
    borderRadius: ROTATE_HANDLE_SIZE / 2,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: floor.grip,
    alignItems: "center",
    justifyContent: "center",
  },
});
