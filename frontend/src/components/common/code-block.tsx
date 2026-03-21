import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  return (
    <SyntaxHighlighter
      language={language ?? 'typescript'}
      style={oneDark}
      customStyle={{
        margin: 0,
        borderRadius: '0.375rem',
        fontSize: '0.8125rem',
        lineHeight: '1.5',
      }}
      wrapLongLines
    >
      {code}
    </SyntaxHighlighter>
  );
}
