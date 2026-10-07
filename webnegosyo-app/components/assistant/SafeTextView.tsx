import { StyleSheet, Text, View } from "react-native";
import { parseSafeText, type InlineRun } from "../../lib/assistant/safe-text";
import { colors } from "../../theme/colors";

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((run, index) => (
        <Text key={index} style={run.isBold ? styles.bold : undefined}>
          {run.text}
        </Text>
      ))}
    </>
  );
}

/** The assistant's words, rendered as text only (see lib/assistant/safe-text.ts). */
export function SafeTextView({ text }: { text: string }) {
  return (
    <View style={styles.stack}>
      {parseSafeText(text).map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <Text key={index} style={styles.body}>
              <Runs runs={block.runs} />
            </Text>
          );
        }
        return (
          <View key={index} style={styles.list}>
            {block.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.listRow}>
                <Text style={styles.marker}>{block.type === "bullets" ? "•" : `${itemIndex + 1}.`}</Text>
                <Text style={[styles.body, styles.listText]}>
                  <Runs runs={item} />
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  body: { fontSize: 15, lineHeight: 22, color: colors.textPrimary },
  bold: { fontWeight: "700" },
  list: { gap: 4 },
  listRow: { flexDirection: "row", gap: 6, paddingLeft: 2 },
  marker: { fontSize: 15, lineHeight: 22, color: colors.textPrimary, minWidth: 16 },
  listText: { flex: 1 },
});
