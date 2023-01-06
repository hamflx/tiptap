import { MarkType } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'

import { MarkRange } from '../types'
import { objectIncludes } from '../utilities/objectIncludes'
import { getMarkType } from './getMarkType'

export function isMarkActive(
  state: EditorState,
  typeOrName: MarkType | string | null,
  attributes: Record<string, any> = {},
): boolean {
  const { empty, ranges } = state.selection
  const type = typeOrName
    ? getMarkType(typeOrName, state.schema)
    : null

  if (empty) {
    return !!(state.storedMarks || state.selection.$from.marks())
      .filter(mark => {
        if (!type) {
          return true
        }

        return type.name === mark.type.name
      })
      .find(mark => objectIncludes(mark.attrs, attributes, { strict: false }))
  }

  let selectionRange = 0
  const markRanges: MarkRange[] = []

  ranges.forEach(({ $from, $to }) => {
    const from = $from.pos
    const to = $to.pos

    state.doc.nodesBetween(from, to, (node, pos) => {
      // 这里是为了解决选区包含了 codeBlock 导致 mark 的指示失效的问题。
      // 比如，存在以下的结构，其中 |< 表示选区开始，>| 表示选区结束：
      // Paragraph(Text[Bold](这里是|<文本内容))
      // CodeBlock(Text(console.log))
      // Paragraph(Text[Bold](这里是>|文本内容))
      // 而 codeBlock 中的文本是无法设置 mark 标记的，在这里计算的时候，会导致总有一部分为无标记状态，
      // 从而导致标记按钮永远无法处于激活状态。因此，这里检查如果这个 mark 无法应用到这个 node 上，则不统计该 node。
      if (!node.isText && type && !node.type.allowsMarkType(type)) {
        return false
      }
      if (!node.isText && !node.marks.length) {
        return
      }

      const relativeFrom = Math.max(from, pos)
      const relativeTo = Math.min(to, pos + node.nodeSize)
      const range = relativeTo - relativeFrom

      selectionRange += range

      markRanges.push(...node.marks.map(mark => ({
        mark,
        from: relativeFrom,
        to: relativeTo,
      })))
    })
  })

  if (selectionRange === 0) {
    return false
  }

  // calculate range of matched mark
  const matchedRange = markRanges
    .filter(markRange => {
      if (!type) {
        return true
      }

      return type.name === markRange.mark.type.name
    })
    .filter(markRange => objectIncludes(markRange.mark.attrs, attributes, { strict: false }))
    .reduce((sum, markRange) => sum + markRange.to - markRange.from, 0)

  // calculate range of marks that excludes the searched mark
  // for example `code` doesn’t allow any other marks
  const excludedRange = markRanges
    .filter(markRange => {
      if (!type) {
        return true
      }

      return markRange.mark.type !== type
        && markRange.mark.type.excludes(type)
    })
    .reduce((sum, markRange) => sum + markRange.to - markRange.from, 0)

  // we only include the result of `excludedRange`
  // if there is a match at all
  const range = matchedRange > 0
    ? matchedRange + excludedRange
    : matchedRange

  return range >= selectionRange
}
