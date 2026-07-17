"use client"

import React from "react"
import { handleComponentOutputAnchorClick } from "../../../app/lib/component-output-link-navigation"

export const COMPONENT_OUTPUT_INLINE_LINK_CLASS =
  "text-primary cursor-pointer underline decoration-dotted underline-offset-[3px] hover:text-primary/90"

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g
const BARE_URL_PATTERN = /((?:https?:\/\/|app:\/\/)[^\s<]+[^\s<.,;:!?)}\]'"])/gi

type ComponentOutputLinkTextProps = {
  text: string
  pathname: string
  fromAiChat?: boolean
  className?: string
}

function renderAnchor(args: {
  key: string
  href: string
  label: string
  pathname: string
  fromAiChat: boolean
}) {
  return (
    <a
      key={args.key}
      href={args.href}
      className={COMPONENT_OUTPUT_INLINE_LINK_CLASS}
      onClick={(event) => {
        handleComponentOutputAnchorClick({
          event,
          href: args.href,
          pathname: args.pathname,
          fromAiChat: args.fromAiChat,
        })
      }}
    >
      {args.label}
    </a>
  )
}

function renderPlainSegment(args: {
  text: string
  keyPrefix: string
  pathname: string
  fromAiChat: boolean
}) {
  const parts = args.text.split(BARE_URL_PATTERN)
  if (parts.length === 1) return args.text

  return parts.map((part, index) => {
    if (!part) return null
    BARE_URL_PATTERN.lastIndex = 0
    if (BARE_URL_PATTERN.test(part)) {
      return renderAnchor({
        key: `${args.keyPrefix}-url-${index}-${part}`,
        href: part,
        label: part,
        pathname: args.pathname,
        fromAiChat: args.fromAiChat,
      })
    }
    return <React.Fragment key={`${args.keyPrefix}-text-${index}`}>{part}</React.Fragment>
  })
}

export function ComponentOutputLinkText({
  text,
  pathname,
  fromAiChat = false,
  className,
}: ComponentOutputLinkTextProps) {
  if (!text) return null

  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null = null
  MARKDOWN_LINK_PATTERN.lastIndex = 0

  while ((match = MARKDOWN_LINK_PATTERN.exec(text)) != null) {
    const [full, label, href] = match
    const start = match.index
    if (start > lastIndex) {
      nodes.push(
        <React.Fragment key={`segment-${lastIndex}`}>
          {renderPlainSegment({
            text: text.slice(lastIndex, start),
            keyPrefix: `segment-${lastIndex}`,
            pathname,
            fromAiChat,
          })}
        </React.Fragment>,
      )
    }
    nodes.push(
      renderAnchor({
        key: `md-${start}-${href}`,
        href,
        label,
        pathname,
        fromAiChat,
      }),
    )
    lastIndex = start + full.length
  }

  if (nodes.length === 0) {
    return (
      <span className={className}>
        {renderPlainSegment({ text, keyPrefix: "plain", pathname, fromAiChat })}
      </span>
    )
  }

  if (lastIndex < text.length) {
    nodes.push(
      <React.Fragment key={`segment-tail-${lastIndex}`}>
        {renderPlainSegment({
          text: text.slice(lastIndex),
          keyPrefix: `segment-tail-${lastIndex}`,
          pathname,
          fromAiChat,
        })}
      </React.Fragment>,
    )
  }

  return <span className={className}>{nodes}</span>
}
