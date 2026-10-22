import { useLayoutEffect, useRef, useState } from 'react';
import { partContact, type PartContact } from '../core/tables/detailPartContact';
import type { DetailPart } from '../core/tables/detailParts';
export type ContactMotion = PartContact & { id: string; velocity: number; target: number; origin: DetailPart };
export function useDetailContactMotion(parts: DetailPart[], activeId: string | null) {
  const motion = useRef<{ activeId: string | null; contacts: ContactMotion[] }>({ activeId: null, contacts: [] });
  const frame = useRef(0);
  const [state, setState] = useState(motion.current);
  useLayoutEffect(() => {
    const active = parts.find(part => part.id === activeId);
    const targets = active ? parts.flatMap(part => {
      const contact = partContact(part, active);
      return contact ? [{ ...contact, id: part.id, origin: part }] : [];
    }) : [];
    const previous = motion.current;
    if (activeId && previous.activeId !== activeId) previous.contacts = [];
    if (activeId) previous.activeId = activeId;
    previous.contacts = [...targets.map(target => {
      const old = previous.contacts.find(item => item.id === target.id && item.side === target.side);
      return { ...target, target: target.depth, depth: old?.depth ?? 0, velocity: old?.velocity ?? 0 };
    }), ...previous.contacts.filter(old => !targets.some(target => target.id === old.id && target.side === old.side)).map(old => ({ ...old, target: 0 }))];
    if (frame.current) return;
    let previousTime = performance.now();
    const tick = (time: number) => {
      const dt = Math.min(1 / 60, (time - previousTime) / 1000);
      previousTime = time;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let running = false;
      const current = motion.current;
      for (const item of current.contacts) {
        item.velocity += ((item.target - item.depth) * 260 - item.velocity * 18) * dt;
        item.depth += item.velocity * dt;
        if (reduced || Math.abs(item.depth - item.target) < .015 && Math.abs(item.velocity) < .05) {
          item.depth = item.target; item.velocity = 0;
        } else running = true;
      }
      current.contacts = current.contacts.filter(item => item.depth !== 0 || item.target !== 0);
      setState({ activeId: current.activeId, contacts: current.contacts.map(item => ({ ...item })) });
      frame.current = running ? requestAnimationFrame(tick) : 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, [parts, activeId]);
  useLayoutEffect(() => () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0; // StrictMode remount must be able to schedule the next frame.
  }, []);
  return state;
}
