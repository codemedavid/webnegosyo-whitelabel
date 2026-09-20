import React, { useMemo } from "react";
import Svg, { Circle, G, Line, Rect } from "react-native-svg";

import type { Rotation, TableShape } from "../../lib/tables/table-floor";
import { seatSlots, type SeatSlot, type TableBody } from "../../lib/tables/table-furniture";
import { floor, STATUS_WASH_OPACITY, type StatusTone } from "./floor-tokens";

interface TableGraphicProps {
  shape: TableShape;
  seats: number;
  /** How many of those chairs are taken; they fill in seat order. */
  covers: number;
  /** The table top, in pixels. */
  body: TableBody;
  /** The drawing surface — the top, its chairs, and the turn it is set at. */
  node: TableBody;
  rotation: Rotation;
  tone: StatusTone;
  /** An available table keeps its bare wood; every other state takes a wash. */
  isWashed: boolean;
}

const SHADOW_DROP = 2.5;
const INLAY_INSET = 0.13;
const GRAIN_OPACITY = 1;
const RING_WIDTH = 2.5;
const CHAIR_BACK_OF_DEPTH = 0.38;
const CHAIR_SEAT_OF_WIDTH = 0.86;

function cornerRadius(body: TableBody): number {
  return Math.max(3, Math.min(body.w, body.h) * 0.14);
}

/**
 * One table top, centred on the origin. Round tables are drawn as circles,
 * everything else as a rounded rectangle — the same call draws the drop
 * shadow, the wood, the inlay and the status ring by varying inset and fill.
 */
function TopShape({
  shape,
  body,
  inset,
  fill,
  stroke,
  strokeWidth,
  opacity,
  dy = 0,
}: {
  shape: TableShape;
  body: TableBody;
  inset: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  dy?: number;
}) {
  const w = body.w - inset * 2;
  const h = body.h - inset * 2;
  if (shape === "round") {
    return (
      <Circle
        cx={0}
        cy={dy}
        r={Math.max(0, Math.min(w, h) / 2)}
        fill={fill ?? "none"}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }
  return (
    <Rect
      x={-w / 2}
      y={-h / 2 + dy}
      width={Math.max(0, w)}
      height={Math.max(0, h)}
      rx={cornerRadius(body)}
      fill={fill ?? "none"}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
    />
  );
}

/** Two lines of grain across the top, kept inside its edge. */
function Grain({ shape, body }: { shape: TableShape; body: TableBody }) {
  const rows = [-0.22, 0.22].map((fraction) => {
    const y = body.h * fraction;
    if (shape !== "round") return { y, half: (body.w / 2) * 0.72 };
    const radius = Math.min(body.w, body.h) / 2;
    const chord = Math.sqrt(Math.max(0, radius * radius - y * y));
    return { y, half: chord * 0.78 };
  });

  return (
    <>
      {rows.map((row) => (
        <Line
          key={row.y}
          x1={-row.half}
          y1={row.y}
          x2={row.half}
          y2={row.y}
          stroke={floor.woodGrain}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={GRAIN_OPACITY}
        />
      ))}
    </>
  );
}

/** One chair, drawn facing up: back bar away from the table, seat toward it. */
function Chair({ slot, isTaken, tone }: { slot: SeatSlot; isTaken: boolean; tone: StatusTone }) {
  const backDepth = slot.d * CHAIR_BACK_OF_DEPTH;
  const seatWidth = slot.w * CHAIR_SEAT_OF_WIDTH;
  const seatDepth = slot.d - backDepth;

  return (
    <G x={slot.x} y={slot.y}>
      <G rotation={slot.angle} origin="0, 0">
        <Rect
          x={-slot.w / 2}
          y={-slot.d / 2}
          width={slot.w}
          height={backDepth}
          rx={backDepth / 2}
          fill={isTaken ? tone.ring : floor.chairBack}
        />
        <Rect
          x={-seatWidth / 2}
          y={-slot.d / 2 + backDepth * 0.75}
          width={seatWidth}
          height={seatDepth}
          rx={Math.min(4, seatDepth / 2)}
          fill={isTaken ? tone.ring : floor.chairFill}
          stroke={floor.chairEdge}
          strokeWidth={0.75}
          opacity={isTaken ? 0.92 : 1}
        />
      </G>
    </G>
  );
}

/**
 * A table as it sits in the room: chairs pulled in around a wooden top,
 * turned whichever way the merchant set it. Presentation only — every
 * measurement comes from lib/tables/table-furniture.
 */
export function TableGraphic({
  shape,
  seats,
  covers,
  body,
  node,
  rotation,
  tone,
  isWashed,
}: TableGraphicProps) {
  const slots = useMemo(() => seatSlots(shape, seats, body), [shape, seats, body]);

  return (
    <Svg width={node.w} height={node.h} pointerEvents="none">
      <G x={node.w / 2} y={node.h / 2}>
        <G rotation={rotation} origin="0, 0">
          {slots.map((slot) => (
            <Chair key={slot.index} slot={slot} isTaken={slot.index < covers} tone={tone} />
          ))}
          <TopShape shape={shape} body={body} inset={0} fill={floor.woodShade} dy={SHADOW_DROP} />
          <TopShape shape={shape} body={body} inset={0} fill={floor.woodEdge} />
          <TopShape
            shape={shape}
            body={body}
            inset={Math.min(body.w, body.h) * INLAY_INSET * 0.5}
            fill={floor.woodTop}
          />
          <TopShape
            shape={shape}
            body={body}
            inset={Math.min(body.w, body.h) * INLAY_INSET}
            fill={floor.woodInlay}
          />
          <Grain shape={shape} body={body} />
          {isWashed ? (
            <TopShape
              shape={shape}
              body={body}
              inset={Math.min(body.w, body.h) * INLAY_INSET * 0.5}
              fill={tone.fill}
              opacity={STATUS_WASH_OPACITY}
            />
          ) : null}
          <TopShape
            shape={shape}
            body={body}
            inset={RING_WIDTH / 2}
            stroke={tone.ring}
            strokeWidth={RING_WIDTH}
          />
        </G>
      </G>
    </Svg>
  );
}
