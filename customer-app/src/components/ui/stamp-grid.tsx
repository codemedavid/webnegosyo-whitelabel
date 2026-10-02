import { Star } from 'lucide-react-native'
import { View } from 'react-native'
import Animated, { ZoomIn } from 'react-native-reanimated'

const STAMPS_PER_ROW = 5
const STAGGER_MS = 45

interface StampGridProps {
  filled: number
  total: number
  size?: number
  filledColor: string
  emptyColor: string
  inkColor: string
}

/** A punch card: filled stamps pop in one after another. */
export function StampGrid({ filled, total, size = 44, filledColor, emptyColor, inkColor }: StampGridProps) {
  const gap = size * 0.28
  return (
    <View
      accessible
      accessibilityLabel={`${filled} of ${total} stamps collected`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap, width: STAMPS_PER_ROW * size + (STAMPS_PER_ROW - 1) * gap }}
    >
      {Array.from({ length: total }, (_, index) => {
        const isFilled = index < filled
        return (
          <View
            key={index}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: isFilled ? 0 : 2,
              borderStyle: 'dashed',
              borderColor: emptyColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isFilled ? (
              <Animated.View
                entering={ZoomIn.delay(index * STAGGER_MS).springify()}
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: filledColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Star size={size * 0.45} color={inkColor} fill={inkColor} />
              </Animated.View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
