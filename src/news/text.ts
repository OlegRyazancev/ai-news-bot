const MARKDOWN_EMPHASIS_WRAPPERS = ['***', '___', '**', '__', '*', '_'] as const;

export function stripWrappingMarkdownEmphasis(value: string): string {
  const trimmed = value.trim();

  for (const wrapper of MARKDOWN_EMPHASIS_WRAPPERS) {
    if (trimmed.length > wrapper.length * 2 && trimmed.startsWith(wrapper) && trimmed.endsWith(wrapper)) {
      return trimmed.slice(wrapper.length, -wrapper.length).trim();
    }
  }

  return trimmed;
}
