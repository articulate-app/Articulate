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
  onAttachmentClick?: () => void // callback for attachment icon
  renderSendButton?: () => React.ReactNode // custom send button
  onFocus?: () => void // focus event for parent
  onBlur?: () => void // blur event for parent
}

export function RichTextEditor({ value, onChange, readOnly = false, placeholder, height = 120, toolbarId = 'ql-toolbar-rich', onAttachmentClick, renderSendButton, onFocus, onBlur }: RichTextEditorProps) {
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
            onChange={val => {
              setLocalValue(val);
              // Always call onChange immediately with the full value (no trimming)
              onChange(val);
              lastPropValue.current = val;
            }}
            readOnly={readOnly}
            placeholder={placeholder}
            theme="snow"
            modules={modules}
            style={{ height: '100%', paddingBottom: 40 }}
            onFocus={e => {
              setIsFocused(true);
              onFocus && onFocus();
            }}
            onBlur={e => {
              handleBlur();
              onBlur && onBlur();
            }}
          />
          {/* Custom send button inside the editor, bottom right */}
          {renderSendButton && (
            <div style={{ position: 'absolute', right: 8, bottom: 8, zIndex: 30 }}>
              {renderSendButton()}
            </div>
          )}
          {/* Custom toolbar as sibling, always rendered but only visible when focused */}
          <div
            id={toolbarId}
            className="ql-toolbar rounded-b-md border-t bg-white z-20"
            style={{
              minHeight: 36,
              width: '100%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              opacity: isFocused ? 1 : 0,
              pointerEvents: isFocused ? 'auto' : 'none',
              transition: 'opacity 0.2s',
              position: 'absolute',
              left: 0,
              bottom: 0,
              borderTop: '1px solid #e5e7eb',
              background: '#fff',
              padding: '4px 8px',
              paddingRight: renderSendButton ? '80px' : '8px', // Add extra right padding when send button is present
              display: 'flex',
              overflow: 'hidden',
            }}
          >
            <div 
              className="flex items-center"
              style={{
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
                flex: 1,
                minWidth: 0,
              }}
            >
              <div className="flex items-center flex-nowrap whitespace-nowrap" style={{ minWidth: 'max-content', gap: '2px' }}>
                <span className="ql-formats" style={{ display: 'flex', gap: '1px', flexShrink: 0, marginRight: '4px' }}>
                  <button 
                    type="button"
                    className={`ql-bold ${isFormatActive('bold') ? 'text-blue-500' : 'text-gray-400'}`} 
                    style={{ width: '24px', height: '24px' }} 
                    title="Bold"
                    onClick={() => {
                      if (quillRef.current) {
                        const quill = quillRef.current.getEditor();
                        quill.format('bold', !quill.getFormat().bold);
                      }
                    }}
                  />
                  <button 
                    type="button"
                    className={`ql-italic ${isFormatActive('italic') ? 'text-blue-500' : 'text-gray-400'}`} 
                    style={{ width: '24px', height: '24px' }} 
                    title="Italic"
                    onClick={() => {
                      if (quillRef.current) {
                        const quill = quillRef.current.getEditor();
                        quill.format('italic', !quill.getFormat().italic);
                      }
                    }}
                  />
                  <button 
                    type="button"
                    className={`ql-underline ${isFormatActive('underline') ? 'text-blue-500' : 'text-gray-400'}`} 
                    style={{ width: '24px', height: '24px' }} 
                    title="Underline"
                    onClick={() => {
                      if (quillRef.current) {
                        const quill = quillRef.current.getEditor();
                        quill.format('underline', !quill.getFormat().underline);
                      }
                    }}
                  />
                  <button 
                    type="button"
                    className={`ql-strike ${isFormatActive('strike') ? 'text-blue-500' : 'text-gray-400'}`} 
                    style={{ width: '24px', height: '24px' }} 
                    title="Strike"
                    onClick={() => {
                      if (quillRef.current) {
                        const quill = quillRef.current.getEditor();
                        quill.format('strike', !quill.getFormat().strike);
                      }
                    }}
                  />
                </span>
                <span className="ql-formats" style={{ display: 'flex', gap: '1px', flexShrink: 0, marginRight: '4px' }}>
                  <button 
                    type="button"
                    className={`ql-list ${isFormatActive('list', 'ordered') ? 'text-blue-500' : 'text-gray-400'}`} 
                    value="ordered" 
                    style={{ width: '24px', height: '24px' }}
                    onClick={() => {
                      if (quillRef.current) {
                        const quill = quillRef.current.getEditor();
                        const format = quill.getFormat();
                        quill.format('list', format.list === 'ordered' ? false : 'ordered');
                      }
                    }}
                  />
                  <button 
                    type="button"
                    className={`ql-list ${isFormatActive('list', 'bullet') ? 'text-blue-500' : 'text-gray-400'}`} 
                    value="bullet" 
                    style={{ width: '24px', height: '24px' }}
                    onClick={() => {
                      if (quillRef.current) {
                        const quill = quillRef.current.getEditor();
                        const format = quill.getFormat();
                        quill.format('list', format.list === 'bullet' ? false : 'bullet');
                      }
                    }}
                  />
                </span>
                <span className="ql-formats" style={{ display: 'flex', gap: '1px', flexShrink: 0, marginRight: '4px' }}>
                  <button 
                    type="button"
                    className={`ql-link ${isFormatActive('link') ? 'text-blue-500' : 'text-gray-400'}`} 
                    style={{ width: '24px', height: '24px' }}
                    onClick={() => {
                      if (quillRef.current) {
                        const quill = quillRef.current.getEditor();
                        const url = prompt('Enter URL:');
                        if (url) {
                          const range = quill.getSelection();
                          if (range) {
                            quill.format('link', url);
                          }
                        }
                      }
                    }}
                  />
                </span>
                <span className="ql-formats" style={{ display: 'flex', gap: '1px', flexShrink: 0, marginRight: '4px' }}>
                  <button 
                    type="button"
                    className="ql-clean text-gray-400" 
                    style={{ width: '24px', height: '24px' }}
                    onClick={() => {
                      if (quillRef.current) {
                        const quill = quillRef.current.getEditor();
                        quill.removeFormat();
                      }
                    }}
                  />
                </span>
                {/* Custom attachment icon */}
                {onAttachmentClick && (
                  <span className="ql-formats" style={{ display: 'flex', gap: '1px', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="ql-attachment text-gray-400 hover:text-blue-500"
                      tabIndex={-1}
                      onClick={onAttachmentClick}
                      title="Attach file"
                      aria-label="Attach file"
                      style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                    >
                      {/* Paperclip SVG icon, styled like other toolbar icons */}
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 13.5l-5.5 5.5a5 5 0 0 1-7.07-7.07l9-9a3 3 0 0 1 4.24 4.24l-9 9a1 1 0 0 1-1.42-1.42l8.3-8.3"/></svg>
                    </button>
                  </span>
                )}
              </div>
            </div>
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
        /* Hide scrollbars for toolbar container */
        .ql-toolbar div::-webkit-scrollbar { display: none; }
        .ql-toolbar div { -webkit-overflow-scrolling: touch; }
        /* Ensure toolbar buttons don't wrap and have consistent sizing */
        .ql-toolbar .ql-formats { 
          white-space: nowrap !important; 
          flex-shrink: 0 !important;
        }
        .ql-toolbar button {
          width: 24px !important;
          height: 24px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 0 !important;
          border: none !important;
          background: transparent !important;
          border-radius: 2px !important;
          transition: all 0.15s ease !important;
        }
        .ql-toolbar button:hover {
          background: #f3f4f6 !important;
        }
        
        /* Ensure Quill icons are visible */
        .ql-bold::before { content: "B" !important; font-weight: bold !important; }
        .ql-italic::before { content: "I" !important; font-style: italic !important; }
        .ql-underline::before { content: "U" !important; text-decoration: underline !important; }
        .ql-strike::before { content: "S" !important; text-decoration: line-through !important; }
        .ql-list[value="ordered"]::before { content: "1." !important; }
        .ql-list[value="bullet"]::before { content: "•" !important; }
        .ql-link::before { content: "🔗" !important; }
        .ql-clean::before { content: "×" !important; }
        
        /* Override any Quill default styles that might hide icons */
        .ql-toolbar .ql-bold::before,
        .ql-toolbar .ql-italic::before,
        .ql-toolbar .ql-underline::before,
        .ql-toolbar .ql-strike::before,
        .ql-toolbar .ql-list::before,
        .ql-toolbar .ql-link::before,
        .ql-toolbar .ql-clean::before {
          display: inline-block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}

export default RichTextEditor; 