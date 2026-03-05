'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseDragResizeOptions {
  defaultPosition?: { x: number; y: number }
  defaultSize?: { width: number; height: number }
  minWidth?: number
  minHeight?: number
  margin?: number
}

export function useDragResize({
  defaultPosition = { x: 24, y: 72 },
  defaultSize = { width: 820, height: 700 },
  minWidth = 560,
  minHeight = 520,
  margin = 12,
}: UseDragResizeOptions = {}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPosition, setPanelPosition] = useState(defaultPosition)
  const [panelSize, setPanelSize] = useState(defaultSize)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const resizeState = useRef({
    startX: 0,
    startY: 0,
    startWidth: defaultSize.width,
    startHeight: defaultSize.height,
  })

  const clampPanelSize = useCallback(
    (width: number, height: number, x = panelPosition.x, y = panelPosition.y) => {
      if (typeof window === 'undefined') return { width, height }
      const maxWidth = Math.max(360, window.innerWidth - x - margin)
      const maxHeight = Math.max(320, window.innerHeight - y - margin)
      const effectiveMinWidth = Math.min(minWidth, maxWidth)
      const effectiveMinHeight = Math.min(minHeight, maxHeight)
      return {
        width: Math.min(Math.max(effectiveMinWidth, width), maxWidth),
        height: Math.min(Math.max(effectiveMinHeight, height), maxHeight),
      }
    },
    [panelPosition.x, panelPosition.y, margin, minWidth, minHeight]
  )

  const clampPanelPosition = useCallback(
    (x: number, y: number, width = panelSize.width, height = panelSize.height) => {
      if (typeof window === 'undefined') return { x, y }
      const maxX = Math.max(margin, window.innerWidth - width - margin)
      const maxY = Math.max(margin, window.innerHeight - height - margin)
      return {
        x: Math.min(Math.max(margin, x), maxX),
        y: Math.min(Math.max(margin, y), maxY),
      }
    },
    [panelSize.height, panelSize.width, margin]
  )

  const centerPanel = useCallback(() => {
    if (typeof window === 'undefined') return
    const viewportMaxWidth = Math.max(360, window.innerWidth - margin * 2)
    const viewportMaxHeight = Math.max(320, window.innerHeight - margin * 2)
    const viewportMinWidth = Math.min(minWidth, viewportMaxWidth)
    const viewportMinHeight = Math.min(minHeight, viewportMaxHeight)
    const nextSize = {
      width: Math.min(Math.max(viewportMinWidth, panelSize.width), viewportMaxWidth),
      height: Math.min(Math.max(viewportMinHeight, panelSize.height), viewportMaxHeight),
    }
    const centered = clampPanelPosition(
      (window.innerWidth - nextSize.width) / 2,
      (window.innerHeight - nextSize.height) / 2,
      nextSize.width,
      nextSize.height
    )
    setPanelSize(nextSize)
    setPanelPosition(centered)
  }, [clampPanelPosition, panelSize.height, panelSize.width, margin, minWidth, minHeight])

  const handleWindowResize = useCallback(() => {
    const nextSize = clampPanelSize(panelSize.width, panelSize.height, panelPosition.x, panelPosition.y)
    const nextPosition = clampPanelPosition(panelPosition.x, panelPosition.y, nextSize.width, nextSize.height)
    setPanelSize(nextSize)
    setPanelPosition(nextPosition)
  }, [clampPanelPosition, clampPanelSize, panelPosition.x, panelPosition.y, panelSize.height, panelSize.width])

  const handleDragStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isResizing) return
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-editor-no-drag="true"]')) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragOffset.current = {
        x: event.clientX - panelPosition.x,
        y: event.clientY - panelPosition.y,
      }
      setIsDragging(true)
    },
    [isResizing, panelPosition.x, panelPosition.y]
  )

  const handleDragMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return
      const next = clampPanelPosition(
        event.clientX - dragOffset.current.x,
        event.clientY - dragOffset.current.y,
        panelSize.width,
        panelSize.height
      )
      setPanelPosition(next)
    },
    [clampPanelPosition, isDragging, panelSize.height, panelSize.width]
  )

  const handleDragEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsDragging(false)
  }, [])

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isDragging) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      resizeState.current = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth: panelSize.width,
        startHeight: panelSize.height,
      }
      setIsResizing(true)
    },
    [isDragging, panelSize.height, panelSize.width]
  )

  const handleResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing) return
      event.preventDefault()
      const rawWidth = resizeState.current.startWidth + (event.clientX - resizeState.current.startX)
      const rawHeight = resizeState.current.startHeight + (event.clientY - resizeState.current.startY)
      const nextSize = clampPanelSize(rawWidth, rawHeight)
      setPanelSize(nextSize)
      setPanelPosition((current) => clampPanelPosition(current.x, current.y, nextSize.width, nextSize.height))
    },
    [clampPanelPosition, clampPanelSize, isResizing]
  )

  const handleResizeEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsResizing(false)
  }, [])

  // Attach window resize listener
  const useWindowResize = (isOpen: boolean) => {
    useEffect(() => {
      if (!isOpen) return
      window.addEventListener('resize', handleWindowResize)
      return () => window.removeEventListener('resize', handleWindowResize)
    }, [isOpen])
  }

  return {
    panelRef,
    panelPosition,
    panelSize,
    isDragging,
    isResizing,
    centerPanel,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    useWindowResize,
    margin,
  }
}
