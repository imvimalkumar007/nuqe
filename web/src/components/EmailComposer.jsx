import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useCallback } from 'react';

// ─── Toolbar button ───────────────────────────────────────────────────────────

function ToolbarBtn({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={[
        'px-2 py-1 text-xs rounded transition-colors select-none',
        active
          ? 'bg-nuqe-purple/20 text-nuqe-purple border border-nuqe-purple/30'
          : 'text-nuqe-muted border border-transparent hover:text-nuqe-text hover:bg-white/5',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ─── Formatting toolbar ───────────────────────────────────────────────────────

function Toolbar({ editor }) {
  if (!editor) return null;
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-white/10 bg-nuqe-bg/60 flex-wrap">
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      >
        <strong>B</strong>
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      >
        <em>I</em>
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      >
        <span className="line-through">S</span>
      </ToolbarBtn>

      <span className="w-px h-3.5 bg-white/10 mx-1" />

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet list"
      >
        ≡
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered list"
      >
        1.
      </ToolbarBtn>

      <span className="w-px h-3.5 bg-white/10 mx-1" />

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Quote"
      >
        "
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        active={false}
        title="Divider"
      >
        —
      </ToolbarBtn>

      <span className="w-px h-3.5 bg-white/10 mx-1" />

      <ToolbarBtn
        onClick={() => editor.chain().focus().undo().run()}
        active={false}
        title="Undo"
      >
        ↩
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().redo().run()}
        active={false}
        title="Redo"
      >
        ↪
      </ToolbarBtn>
    </div>
  );
}

// ─── CC / BCC token input ─────────────────────────────────────────────────────

function EmailTokenInput({ label, value, onChange }) {
  const [input, setInput] = useState('');

  function commit() {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!value.includes(trimmed)) onChange([...value, trimmed]);
    setInput('');
  }

  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Backspace' && !input && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 border-b border-white/10 bg-nuqe-bg min-h-[32px] flex-wrap">
      <span className="text-[11px] text-nuqe-muted shrink-0 mt-0.5 font-medium w-6">{label}:</span>
      <div className="flex flex-wrap gap-1 flex-1">
        {value.map((addr) => (
          <span key={addr} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-nuqe-purple/15 border border-nuqe-purple/25 text-[11px] text-nuqe-text">
            {addr}
            <button
              type="button"
              onClick={() => onChange(value.filter((a) => a !== addr))}
              className="text-nuqe-muted hover:text-nuqe-danger leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
          placeholder={value.length ? '' : 'Add address…'}
          className="flex-1 min-w-[120px] bg-transparent text-xs text-nuqe-text placeholder-nuqe-muted outline-none"
        />
      </div>
    </div>
  );
}

// ─── Main EmailComposer ───────────────────────────────────────────────────────

/**
 * Props:
 *   toEmail     string|null   — recipient (display only, read-only)
 *   subject     string
 *   onSubject   fn(string)
 *   signature   string|null   — appended automatically to new drafts
 *   onSend      fn({ subject, htmlBody, plainBody, cc, bcc }) → Promise
 *   onNote      fn({ body }) → Promise   — internal note send
 *   onAiDraft   fn() → void
 *   isSending   bool
 *   disabled    bool          — e.g. pending AI review
 *   disabledReason string|null
 *   initialBody string|null   — pre-fill (Edit & Approve flow)
 */
export default function EmailComposer({
  toEmail,
  subject,
  onSubject,
  signature,
  onSend,
  onNote,
  onAiDraft,
  isSending,
  disabled,
  disabledReason,
  initialBody,
}) {
  const [cc,       setCc]       = useState([]);
  const [bcc,      setBcc]      = useState([]);
  const [showCc,   setShowCc]   = useState(false);
  const [showBcc,  setShowBcc]  = useState(false);
  const [mode,     setMode]     = useState('reply');  // 'reply' | 'note'
  const [sendErr,  setSendErr]  = useState(null);

  const signatureHtml = signature
    ? `<p></p><hr><p style="color:#888;font-size:12px">${signature}</p>`
    : '';

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your reply…' }),
    ],
    content: initialBody
      ? `${initialBody}${signatureHtml}`
      : signatureHtml || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2 text-xs text-nuqe-text leading-relaxed',
      },
    },
  });

  const getContent = useCallback(() => {
    if (!editor) return { html: '', plain: '' };
    return {
      html:  editor.getHTML(),
      plain: editor.getText(),
    };
  }, [editor]);

  async function handleSend() {
    const { html, plain } = getContent();
    if (!plain.trim()) return;
    setSendErr(null);
    try {
      await onSend({ subject, htmlBody: html, plainBody: plain, cc, bcc });
      editor.commands.setContent(signatureHtml || '');
      setCc([]);
      setBcc([]);
    } catch (err) {
      setSendErr(err?.response?.data?.error ?? err.message ?? 'Send failed');
    }
  }

  async function handleNote() {
    const { plain } = getContent();
    if (!plain.trim()) return;
    setSendErr(null);
    try {
      await onNote({ body: plain });
      editor.commands.clearContent();
    } catch (err) {
      setSendErr(err?.response?.data?.error ?? err.message ?? 'Failed to save note');
    }
  }

  const isNote = mode === 'note';

  return (
    <div className={`border rounded-lg overflow-hidden ${isNote ? 'border-amber-500/25' : 'border-white/10'}`}>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/10 bg-nuqe-surface">
        <button
          type="button"
          onClick={() => setMode('reply')}
          className={`px-2.5 py-1 text-xs rounded border transition-colors ${
            !isNote
              ? 'bg-nuqe-purple/15 text-nuqe-purple border-nuqe-purple/30'
              : 'text-nuqe-muted border-transparent hover:text-nuqe-text'
          }`}
        >
          Reply
        </button>
        <button
          type="button"
          onClick={() => setMode('note')}
          className={`px-2.5 py-1 text-xs rounded border transition-colors ${
            isNote
              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              : 'text-nuqe-muted border-transparent hover:text-nuqe-text'
          }`}
        >
          Internal note
        </button>
        <div className="ml-auto flex items-center gap-2">
          {!showCc && !isNote && (
            <button type="button" onClick={() => setShowCc(true)}
              className="text-[11px] text-nuqe-muted hover:text-nuqe-text">CC</button>
          )}
          {!showBcc && !isNote && (
            <button type="button" onClick={() => setShowBcc(true)}
              className="text-[11px] text-nuqe-muted hover:text-nuqe-text">BCC</button>
          )}
        </div>
      </div>

      {/* To / CC / BCC fields */}
      {!isNote && (
        <>
          {toEmail && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10 bg-nuqe-bg">
              <span className="text-[11px] text-nuqe-muted shrink-0 font-medium w-6">To:</span>
              <span className="text-xs text-nuqe-text truncate">{toEmail}</span>
            </div>
          )}
          {showCc  && <EmailTokenInput label="CC"  value={cc}  onChange={setCc}  />}
          {showBcc && <EmailTokenInput label="BCC" value={bcc} onChange={setBcc} />}

          {/* Subject */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10 bg-nuqe-bg">
            <span className="text-[11px] text-nuqe-muted shrink-0 font-medium w-12">Subject:</span>
            <input
              value={subject}
              onChange={(e) => onSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent text-xs text-nuqe-text placeholder-nuqe-muted outline-none"
            />
          </div>
        </>
      )}

      {isNote && (
        <div className="px-3 py-1.5 border-b border-white/10 bg-amber-500/[0.04]">
          <p className="text-[11px] text-amber-400">
            Internal note — visible to staff only, never sent to the customer.
          </p>
        </div>
      )}

      {/* Toolbar */}
      <Toolbar editor={editor} />

      {/* Editor body */}
      <div className="bg-nuqe-bg">
        <EditorContent editor={editor} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-white/10 bg-nuqe-surface gap-2 flex-wrap">
        {!isNote && (
          <button
            type="button"
            onClick={onAiDraft}
            disabled={disabled}
            className="px-3 py-1.5 text-xs font-medium rounded border border-nuqe-purple/30 bg-nuqe-purple/10 text-nuqe-purple hover:bg-nuqe-purple/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            AI draft
          </button>
        )}
        {isNote && <div />}

        <div className="flex items-center gap-2">
          {disabledReason && (
            <span className="text-[10px] text-amber-400">{disabledReason}</span>
          )}
          <button
            type="button"
            onClick={isNote ? handleNote : handleSend}
            disabled={disabled || isSending}
            className={`px-4 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              isNote
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                : 'border-white/15 bg-white/5 text-nuqe-text hover:bg-white/10'
            }`}
          >
            {isSending ? (isNote ? 'Saving…' : 'Sending…') : (isNote ? 'Save note' : 'Send')}
          </button>
        </div>
      </div>

      {sendErr && (
        <p className="px-3 pb-2 text-[10px] text-nuqe-danger">{sendErr}</p>
      )}
    </div>
  );
}
