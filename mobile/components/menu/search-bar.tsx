import React from 'react'
import { View, TextInput, StyleSheet, TouchableOpacity, Text } from 'react-native'
import { useTheme } from '@/theme/provider'
import { Ionicons } from '@expo/vector-icons'

interface SearchBarProps {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
}

export function SearchBar({ value, onChangeText, placeholder = 'Search menu...' }: SearchBarProps) {
  const { theme } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: theme.cards, borderColor: theme.border }]}>
      <Ionicons name="search" size={18} color={theme.textMuted} style={styles.icon} />
      <TextInput
        style={[styles.input, { color: theme.textPrimary }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <TouchableOpacity onPress={() => onChangeText('')} style={styles.clear}>
          <Ionicons name="close-circle" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  icon: { marginRight: 8 },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  clear: { marginLeft: 8 },
})
