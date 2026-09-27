import React from "react";
import { Image, Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { parseReceiptMarkup, type ReceiptPreviewLine, type ReceiptRun } from "../../lib/receipt-markup";
import { MONO_CHAR_RATIO, paperFontSize, type PreviewBlock } from "../../lib/receipt-preview";
import type { ReceiptSegment } from "../../lib/receipt-layout";
import { QrMark } from "./QrMark";
import { MONO_FONT, PAPER_LINE_RATIO, studio } from "./studio-theme";

/**
 * Thermal paper, drawn from the exact per-block segments the counter prints.
 *
 * Styled lines are drawn the way the head prints them — bold, double height,
 * double size, aligned — and the paper is sized so exactly `columns`
 * characters fit a line, so a name that wraps here wraps on paper.
 *
 * With `onSelectBlock` every block is a tap target: the merchant edits the
 * receipt by touching the line they want to change, not by finding its name
 * in a list. A block that prints nothing on the sample shows as a dashed
 * placeholder rather than vanishing, so it can still be found and removed.
 */

/** The app rasters the logo at 320 of the 384 head dots — about 26 columns. */
const LOGO_COLUMNS = 26;
/** A v6 tracking code at 5 dots a module prints about 17 columns wide. */
const QR_COLUMNS = 17;
/** Text lines a logo occupies in the preview; the real height depends on the image. */
const LOGO_LINES = 4;
/** Share of the paper width kept blank at each side, as the head's margins do. */
const MARGIN_RATIO = 0.055;
/** Safety so rounding in the font's advance width never clips the last column. */
const FIT_SLACK = 0.985;
const TOOTH_WIDTH = 9;
const TOOTH_DEPTH = 6;

interface Metrics {
  fontSize: number;
  lineHeight: number;
  charWidth: number;
  margin: number;
}

function paperMetrics(width: number, columns: number): Metrics {
  // Floors low enough that a thumbnail keeps its columns rather than its margins.
  const margin = Math.round(Math.min(18, Math.max(4, width * MARGIN_RATIO)));
  const fontSize = paperFontSize((width - margin * 2) * FIT_SLACK, columns);
  return {
    fontSize,
    lineHeight: Math.round(fontSize * PAPER_LINE_RATIO),
    charWidth: fontSize * MONO_CHAR_RATIO,
    margin,
  };
}

function runStyle(run: ReceiptRun, fontSize: number): TextStyle | undefined {
  if (!run.bold && !run.wide) return undefined;
  return {
    ...(run.bold ? { fontWeight: "700" as const } : {}),
    // Double width AND height: twice the font, so it also takes two columns.
    ...(run.wide ? { fontSize: fontSize * 2 } : {}),
  };
}

function PaperLine({ line, metrics }: { line: ReceiptPreviewLine; metrics: Metrics }) {
  const hasWide = line.runs.some((run) => run.wide);
  const isTallOnly = !hasWide && line.isTall;
  const text = (
    <Text
      numberOfLines={1}
      ellipsizeMode="clip"
      style={[
        styles.line,
        {
          fontSize: metrics.fontSize,
          lineHeight: hasWide ? metrics.lineHeight * 2 : metrics.lineHeight,
          textAlign: line.align,
        },
      ]}
    >
      {line.runs.length === 0
        ? " "
        : line.runs.map((run, index) => (
            <Text key={index} style={runStyle(run, metrics.fontSize)}>
              {run.text}
            </Text>
          ))}
    </Text>
  );
  if (!isTallOnly) return text;
  // Double height only: same columns, stretched upward into two rows.
  return (
    <View style={{ height: metrics.lineHeight * 2, justifyContent: "center" }}>
      <View style={styles.tall}>{text}</View>
    </View>
  );
}

function PaperSegment({ segment, metrics }: { segment: ReceiptSegment; metrics: Metrics }) {
  if (segment.type === "image") {
    return (
      <Image
        source={{ uri: segment.url }}
        resizeMode="contain"
        alt="Store logo as printed"
        style={{
          alignSelf: "center",
          width: metrics.charWidth * LOGO_COLUMNS,
          height: metrics.lineHeight * LOGO_LINES,
          marginVertical: metrics.lineHeight * 0.25,
        }}
      />
    );
  }
  if (segment.type === "qr") {
    return (
      <View style={[styles.centered, { marginVertical: metrics.lineHeight * 0.25 }]}>
        <QrMark data={segment.data} size={metrics.charWidth * QR_COLUMNS} color={studio.paperInk} />
      </View>
    );
  }
  return (
    <>
      {parseReceiptMarkup(segment.text).map((line, index) => (
        <PaperLine key={index} line={line} metrics={metrics} />
      ))}
    </>
  );
}

/** The bottom of the roll, torn off along the cutter's teeth. */
function TornEdge({ width }: { width: number }) {
  const teeth = Math.max(1, Math.ceil(width / TOOTH_WIDTH));
  const step = width / teeth;
  const points = [`0,0`];
  for (let i = 0; i < teeth; i++) {
    points.push(`${i * step + step / 2},${TOOTH_DEPTH}`, `${(i + 1) * step},0`);
  }
  return (
    <Svg width={width} height={TOOTH_DEPTH} style={styles.edge}>
      <Polygon points={points.join(" ")} fill={studio.paper} />
    </Svg>
  );
}

interface BlockViewProps {
  block: PreviewBlock;
  metrics: Metrics;
  isSelected: boolean;
  isStatic: boolean;
  onSelect?: (id: string) => void;
  onLayout?: (id: string, y: number, height: number) => void;
}

function BlockView({
  block,
  metrics,
  isSelected,
  isStatic,
  onSelect,
  onLayout,
}: BlockViewProps) {
  const body = block.emptyHint ? (
    isStatic ? null : (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText} numberOfLines={1}>
          {block.label} — {block.emptyHint}
        </Text>
      </View>
    )
  ) : (
    block.segments.map((segment, index) => <PaperSegment key={index} segment={segment} metrics={metrics} />)
  );

  if (isStatic) return <View>{body}</View>;

  return (
    <Pressable
      onPress={() => onSelect?.(block.id)}
      onLayout={(event) => onLayout?.(block.id, event.nativeEvent.layout.y, event.nativeEvent.layout.height)}
      accessibilityRole="button"
      accessibilityLabel={`${block.label}. Tap to edit`}
      accessibilityState={{ selected: isSelected }}
      style={({ pressed }) => [
        styles.block,
        isSelected && styles.blockSelected,
        pressed && !isSelected && styles.blockPressed,
      ]}
    >
      {body}
      {isSelected ? (
        <View style={styles.tag} pointerEvents="none">
          <Text style={styles.tagText} numberOfLines={1}>
            {block.label}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

interface ReceiptPaperProps {
  blocks: PreviewBlock[];
  columns: number;
  /** Outer width of the roll, in points. */
  width: number;
  selectedId?: string | null;
  /** Omit for a static thumbnail: no taps, no placeholders, no tags. */
  onSelectBlock?: (id: string) => void;
  /** Where each block sits inside the paper, for scrolling it into view. */
  onBlockLayout?: (id: string, y: number, height: number) => void;
}

export function ReceiptPaper({
  blocks,
  columns,
  width,
  selectedId = null,
  onSelectBlock,
  onBlockLayout,
}: ReceiptPaperProps) {
  const metrics = paperMetrics(width, columns);
  const isStatic = onSelectBlock === undefined;
  return (
    <View style={{ width }}>
      <View
        style={[
          styles.paper,
          {
            paddingHorizontal: metrics.margin,
            paddingTop: metrics.lineHeight * (isStatic ? 0.8 : 1.4),
            paddingBottom: metrics.lineHeight * 1.2,
          },
        ]}
      >
        {blocks.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            metrics={metrics}
            isSelected={block.id === selectedId}
            isStatic={isStatic}
            onSelect={onSelectBlock}
            onLayout={onBlockLayout}
          />
        ))}
      </View>
      <TornEdge width={width} />
    </View>
  );
}

/** Horizontal room a block's highlight takes outside the text, each side. */
const BLOCK_BLEED = 6;

const styles = StyleSheet.create({
  paper: { backgroundColor: studio.paper },
  line: { fontFamily: MONO_FONT, color: studio.paperInk },
  tall: { transform: [{ scaleY: 2 }] },
  centered: { alignItems: "center" },
  edge: { marginTop: -0.5 },
  block: {
    marginHorizontal: -BLOCK_BLEED,
    paddingHorizontal: BLOCK_BLEED - 1.5,
    borderWidth: 1.5,
    borderColor: "transparent",
    borderRadius: 4,
  },
  blockSelected: { borderColor: studio.select, backgroundColor: studio.selectTint },
  blockPressed: { backgroundColor: studio.selectTint },
  tag: {
    position: "absolute",
    top: -10,
    right: 6,
    backgroundColor: studio.select,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { fontSize: 10, fontWeight: "800", color: studio.selectText, letterSpacing: 0.3 },
  placeholder: {
    marginVertical: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: studio.paperFaint,
    borderRadius: 4,
  },
  placeholderText: {
    fontSize: 11,
    fontStyle: "italic",
    color: studio.paperFaint,
    textAlign: "center",
  },
});
