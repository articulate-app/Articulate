"use client"

import 'react-quill/dist/quill.snow.css';
import ReactQuill from 'react-quill';
import { useState, useEffect, useRef } from 'react';

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  placeholder?: string
  height?: number | string // allow parent to override height
  toolbarId?: string // unique toolbar id for each instance
}

export function RichTextEditor({ value, onChange, readOnly = false, placeholder, height = 120, toolbarId = 'ql-toolbar-rich' }: RichTextEditorProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const lastPropValue = useRef(value);
  const quillRef = useRef<any>(null);

  // Update local state if parent value changes and editor is not focused
  useEffect(() => {
    if (!isFocused && value !== lastPropValue.current) {
      setLocalValue(value);
      lastPropValue.current = value;
    }
  }, [value, isFocused]);

  // Save to parent only on blur
  const handleBlur = () => {
    setIsFocused(false);
    if (localValue !== value) {
      onChange(localValue);
      lastPropValue.current = localValue;
    }
  };

  // Always provide toolbar to Quill
  const modules = {
    toolbar: {
      container: `#${toolbarId}`,
    },
  };

  // Helper to determine if a format is active
  const isFormatActive = (format: string, value?: string) => {
    const quill = quillRef.current && quillRef.current.getEditor && quillRef.current.getEditor();
    if (!quill) return false;
    const selection = quill.getSelection();
    if (!selection) return false;
    const formats = quill.getFormat();
    if (value) return formats[format] === value;
    return !!formats[format];
  };

  return (
    <div className="prose prose-sm max-w-none relative">
      <div className="border rounded-md bg-white relative" style={{ height, minHeight: height, display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
        {/* Editor content with extra bottom padding for toolbar */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'visible' }}>
          <ReactQuill
            ref={quillRef}
            value={localValue}
            onChange={setLocalValue}
            readOnly={readOnly}
            placeholder={placeholder}
            theme="snow"
            modules={modules}
            style={{ height: '100%', paddingBottom: 40 }}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
          />
          {/* Custom toolbar as sibling, always rendered but only visible when focused */}
          <div
            id={toolbarId}
            className="ql-toolbar px-2 py-1 flex gap-1 items-center rounded-b-md border-t bg-white z-20"
            style={{
              minHeight: 36,
              width: 'auto',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              opacity: isFocused ? 1 : 0,
              pointerEvents: isFocused ? 'auto' : 'none',
              transition: 'opacity 0.2s',
              position: 'absolute',
              left: 0,
              bottom: 0,
              borderTop: '1px solid #e5e7eb',
              background: '#fff',
            }}
          >
            <span className="ql-formats">
              <button className={`ql-bold ${isFormatActive('bold') ? 'text-blue-500' : 'text-gray-400'}`} />
              <button className={`ql-italic ${isFormatActive('italic') ? 'text-blue-500' : 'text-gray-400'}`} />
              <button className={`ql-underline ${isFormatActive('underline') ? 'text-blue-500' : 'text-gray-400'}`} />
              <button className={`ql-strike ${isFormatActive('strike') ? 'text-blue-500' : 'text-gray-400'}`} />
            </span>
            <span className="ql-formats">
              <button className={`ql-list ${isFormatActive('list', 'ordered') ? 'text-blue-500' : 'text-gray-400'}`} value="ordered" />
              <button className={`ql-list ${isFormatActive('list', 'bullet') ? 'text-blue-500' : 'text-gray-400'}`} value="bullet" />
            </span>
            <span className="ql-formats">
              <button className={`ql-link ${isFormatActive('link') ? 'text-blue-500' : 'text-gray-400'}`} />
            </span>
            <span className="ql-formats">
              <button className="ql-clean text-gray-400" />
            </span>
          </div>
        </div>
      </div>
      <style>{`
        .ql-container { height: 100% !important; min-height: 100% !important; border: none !important; }
        .ql-editor { height: 100% !important; min-height: 100% !important; }
        .ql-toolbar { border: none !important; background: transparent; }
        .ql-toolbar .ql-picker-label, .ql-toolbar .ql-picker-item { color: #9ca3af !important; }
        .ql-toolbar .ql-stroke, .ql-toolbar .ql-fill { stroke: currentColor !important; fill: currentColor !important; }
        /* Hide any default Quill toolbar */
        .ql-snow .ql-toolbar:not([id^='ql-toolbar-rich']) { display: none !important; }
      `}</style>
    </div>
  );
}

export default RichTextEditor; 