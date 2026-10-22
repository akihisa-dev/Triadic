import { usePendingTask } from "./usePendingTask";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Decode locally before replacing the existing image. Nothing is uploaded or persisted. */
export async function readDetailImage(file: File): Promise<{ src: string; name: string }> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("PNG・JPEG・WebPの画像を選択してください。");
  }
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reader.onabort = () => reject(new Error("画像を読み込めませんでした。"));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("画像を読み込めませんでした。"));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = src;
  try { await image.decode(); } catch { throw new Error("画像を読み込めませんでした。別の画像を選択してください。"); }
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("画像を読み込めませんでした。");
  return { src, name: file.name };
}

export function DetailImagePart({ src, name, disabled, index, editing, onEditingChange, onChange }: {
  src: string; name: string; disabled: boolean; index: number; editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onChange: (image: { src: string; name: string }) => void;
}) {
  const task = usePendingTask();
  const input = useRef<HTMLInputElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const latest = useRef({ disabled, onChange, onEditingChange });
  latest.current = { disabled, onChange, onEditingChange };
  const [error, setError] = useState("");
  useLayoutEffect(() => () => { request.current++; }, []);
  // Busy operations wait for accepted reads. Only replacement or removal invalidates their result.
  useLayoutEffect(() => { request.current++; }, [src, name]);
  useEffect(() => {
    if (editing && !disabled) input.current?.click();
  }, [editing, disabled]);
  const finish = () => {
    latest.current.onEditingChange(false);
    view.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const element = input.current!;
    const cancel = () => { latest.current.onEditingChange(false); view.current?.focus({ preventScroll: true }); };
    element.addEventListener("cancel", cancel);
    return () => element.removeEventListener("cancel", cancel);
  }, []);
  async function select(file: File, current: number) {
    try {
      const image = await readDetailImage(file);
      if (current === request.current) latest.current.onChange(image);
    } catch (reason) {
      if (current === request.current) setError(reason instanceof Error ? reason.message : "画像を読み込めませんでした。");
    }
  }
  return <div ref={view} className="detail-image-part" role="button" tabIndex={disabled ? -1 : 0}
    aria-label={`パーツ ${index + 1}の画像を選択・変更`} aria-disabled={disabled}
    onDoubleClick={event => { event.stopPropagation(); if (!disabled) onEditingChange(true); }}
    onKeyDown={event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); event.stopPropagation(); if (!disabled) onEditingChange(true);
      }
    }}>
    {src && <img src={src} alt={name} draggable={false} />}
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={disabled}
      aria-label={`パーツ ${index + 1}の画像ファイル`}
      onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}
      onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        finish();
        if (!file || latest.current.disabled) return;
        const current = ++request.current;
        setError("");
        void task.run(() => select(file, current));
      }} />
    {error && <p className="detail-image-error" role="alert">{error}</p>}
  </div>;
}
