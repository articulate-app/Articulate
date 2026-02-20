declare module 'docx' {
  // Minimal type shim to keep TS happy in environments where deps haven't been installed yet.
  // When `docx` is installed, its own type declarations will take precedence.
  export const Document: any
  export const Packer: any
  export const Paragraph: any
  export const TextRun: any
  export const HeadingLevel: any
}


