export type ListItem = { text: string; done: boolean };

export function listText(items: ListItem[]) {
  return items.map((item) => item.text).join("\n");
}

export function listPosition(items: ListItem[], offset: number) {
  let start = 0;
  for (let index = 0; index < items.length; index++) {
    const end = start + items[index].text.length;
    if (offset <= end || index === items.length - 1)
      return { index, start, offset: offset - start };
    start = end + 1;
  }
  return { index: 0, start: 0, offset: 0 };
}

/** Apply only the changed range, retaining completion and existing multiline items. */
export function editList(
  items: ListItem[],
  next: string,
  selection?: { from: number; to: number },
): ListItem[] | null {
  const previous = listText(items);
  if (previous === next) return items;
  const source = items.length ? items : [{ text: "", done: false }];
  let from = 0;
  while (
    from < previous.length &&
    from < next.length &&
    (!selection || from < selection.from) &&
    previous[from] === next[from]
  )
    from++;
  let to = previous.length,
    end = next.length;
  while (
    to > from &&
    end > from &&
    (!selection || to > selection.to) &&
    previous[to - 1] === next[end - 1]
  ) {
    to--;
    end--;
  }
  const first = listPosition(source, from),
    last = listPosition(source, to);
  const inserted = next.slice(from, end).split("\n");
  inserted[0] = source[first.index].text.slice(0, first.offset) + inserted[0];
  inserted[inserted.length - 1] += source[last.index].text.slice(last.offset);
  const result = [
    ...source.slice(0, first.index),
    ...inserted.map((text, i) => ({
      text,
      done:
        i === inserted.length - 1 &&
        last.offset === 0 &&
        text === source[last.index].text
          ? source[last.index].done
          : i === 0 && (first.offset > 0 || inserted.length === 1)
            ? source[first.index].done
            : false,
    })),
    ...source.slice(last.index + 1),
  ];
  return result.length <= 100 &&
    result.every((item) => item.text.length <= 20000)
    ? result
    : null;
}
