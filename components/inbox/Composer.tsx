"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { PaperPlaneTilt, Paperclip } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import { useSnippets, type Snippet } from "@/hooks/inbox/useSnippets";
import { applySnippetVariables } from "@/lib/inbox/snippet-vars";
import { cn } from "@/lib/utils";

export interface ComposerHandle {
  focus: () => void;
}

interface Props {
  conversationId: string;
  disabled?: boolean;
  /** Set true when contact is blocked / anonimizado — explanation shown. */
  blockedReason?: string | null;
  /** Variáveis para substituir nos snippets ({{nome}}, {{servico}}, {{valor}}…). */
  variables?: Record<string, string>;
}

const MAX_MENU = 8;

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { conversationId, disabled, blockedReason, variables },
  ref,
) {
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const send = useSendMessage();

  const isDisabled = disabled || !!blockedReason || send.isPending;

  // Menu de atalhos: ativo quando o texto é "/" + token (sem espaços/quebras).
  const slashMatch = /^\/(\S*)$/.exec(text);
  const menuActive = !isDisabled && slashMatch !== null;
  const query = (slashMatch?.[1] ?? "").toLowerCase();

  const snippetsQ = useSnippets(true);
  const matches = useMemo<Snippet[]>(() => {
    if (!menuActive) return [];
    const all = (snippetsQ.data ?? []).filter((s) => s.is_active);
    const filtered = query
      ? all.filter(
          (s) =>
            s.shortcut.includes(query) ||
            (s.title ?? "").toLowerCase().includes(query),
        )
      : all;
    return filtered.slice(0, MAX_MENU);
  }, [menuActive, query, snippetsQ.data]);

  const menuOpen = menuActive && (matches.length > 0 || query.length > 0);

  useEffect(() => {
    setHighlight(0);
  }, [query, menuActive]);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
  }));

  function autoresize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  function selectSnippet(s: Snippet) {
    const resolved = applySnippetVariables(s.content, variables ?? {});
    setText(resolved);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(resolved.length, resolved.length);
        autoresize();
      }
    });
  }

  function handleSubmit() {
    const body = text.trim();
    if (!body || isDisabled) return;
    send.mutate(
      { conversation_id: conversationId, body, type: "text" },
      {
        onSuccess: () => {
          setText("");
          requestAnimationFrame(() => autoresize());
        },
      },
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const chosen = matches[highlight] ?? matches[0];
        if (chosen) selectSnippet(chosen);
        return;
      }
    }
    if (e.key === "Escape" && menuOpen) {
      e.preventDefault();
      // Fecha o menu adicionando um espaço (quebra o padrão "/token").
      setText((t) => `${t} `);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  if (blockedReason) {
    return (
      <div className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
        {blockedReason}
      </div>
    );
  }

  return (
    <div className="relative border-t border-border bg-background px-3 py-2">
      {menuOpen && (
        <div
          role="listbox"
          aria-label="Respostas rápidas"
          className="absolute bottom-full left-3 right-3 z-20 mb-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Respostas rápidas · digite para filtrar
          </div>
          {matches.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              Nenhum atalho encontrado para “/{query}”.
            </div>
          ) : (
            matches.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => selectSnippet(s)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left",
                  i === highlight ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-accent-foreground">/{s.shortcut}</span>
                  {s.title && <span className="text-xs font-medium">{s.title}</span>}
                  {s.category && (
                    <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
                      {s.category}
                    </Badge>
                  )}
                </div>
                <span className="line-clamp-1 text-[11px] text-muted-foreground">{s.content}</span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          aria-label="Anexar"
          disabled
          title="Em breve"
        >
          <Paperclip size={16} weight="regular" aria-hidden />
        </Button>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoresize();
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Escreva uma mensagem… (digite / para respostas rápidas)"
          className={cn(
            "min-h-9 max-h-40 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
          )}
          disabled={isDisabled}
          aria-label="Mensagem"
        />
        <Button
          type="button"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleSubmit}
          disabled={isDisabled || !text.trim()}
          aria-label="Enviar"
        >
          <PaperPlaneTilt size={16} weight="fill" aria-hidden />
        </Button>
      </div>
    </div>
  );
});
