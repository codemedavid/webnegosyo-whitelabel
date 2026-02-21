import React from 'react'
import { View, StyleSheet, type ViewStyle, type ImageStyle } from 'react-native'
import { Image } from 'expo-image'

interface OptimizedImageProps {
  source: string | undefined | null
  style?: ViewStyle
  contentFit?: 'cover' | 'contain' | 'fill' | 'none'
  placeholder?: string
  transition?: number
  placeholderColor?: string
}

const blurhash = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4'

export function OptimizedImage({
  source,
  style,
  contentFit = 'cover',
  transition = 200,
  placeholderColor,
}: OptimizedImageProps) {
  if (!source) {
    return (
      <View style={[styles.placeholder, placeholderColor ? { backgroundColor: placeholderColor } : undefined, style]}>
        <View style={styles.iconPlaceholder} />
      </View>
    )
  }

  return (
    <Image
      source={source}
      style={style as ImageStyle}
      contentFit={contentFit}
      placeholder={{ blurhash }}
      transition={transition}
      cachePolicy="memory-disk"
    />
  )
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d1d5db',
  },
})
