import { useState, type RefObject } from "react";
import "./HomeRelations.css";
import { SidebarIcon } from "./SidebarIcon";
import { ScreenDataMap } from "./ScreenDataMap";
import { MechanismMap } from "./MechanismMap";
import { nodes, edges, subNodes, relationKinds, type HomeDestination } from "./home/homeRelations";
import { useRelationGestures, MIN_SCALE, MAX_SCALE } from "./home/useRelationGestures";
export type { HomeDestination } from "./home/homeRelations";
import { type RelationView } from "./useRelationCamera";
export type { RelationView } from "./useRelationCamera";

type Props = {
  onNavigate: (page: HomeDestination) => void;
  disabled: boolean;
  view: RefObject<RelationView | null>;
};
export function HomeRelationsPage({ onNavigate, disabled, view }: Props) {
  const [mode, setMode] = useState("relations");
  const { viewport, selected, setSelected, setActive, setFocused, active, camera, dragging, graph, focusNode, fit, zoomCenter, handlers } = useRelationGestures(view, disabled);
  const isRelated = (edge: typeof edges[number], index: number) => edge.from === active || edge.to === active || subNodes[index]!.page === active;
  const related = new Set(edges.flatMap((edge, index) => isRelated(edge, index) ? [edge.from, edge.to] : []));
  return <main className="home-relations" aria-label="ホーム">
    <header className="home-relations-heading"><h1>Home</h1>
      <div className="home-relations-mode" role="group" aria-label="ホームの表示">
        {[["relations", "関連図"], ["data", "画面とデータ"], ["calculation", "計算の仕組み"], ["process", "処理の流れ"]].map(([id, name]) =>
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id!)}>{name}</button>)}
      </div>
    </header>
    <div hidden={mode !== "data"} style={mode === "data" ? { display: "flex", flex: 1, minHeight: 0 } : undefined}>
      <ScreenDataMap disabled={disabled} />
    </div>
    {mode === "calculation" && <MechanismMap kind="calculation" />}
    {mode === "process" && <MechanismMap kind="process" />}
    <div className="home-relations-canvas" hidden={mode !== "relations"}>
    <div ref={viewport} className={`home-relations-viewport${dragging ? " is-dragging" : ""}`} role="region" aria-label="画面とマスタの相関図" tabIndex={0}
      {...handlers}>
      <svg className="home-relations-map" viewBox="0 0 1240 640" aria-label="画面とマスタの関係" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        {edges.map((edge, index) => <g key={`${edge.from}-${edge.to}`} data-kind={edge.kind} className={`home-relation relation-${edge.kind}${active && isRelated(edge, index) ? " is-active" : active ? " is-muted" : ""}`}>
          <title>{relationKinds.find(([kind]) => kind === edge.kind)![1]}：{edge.label}</title>
          {[0, 1].map(part => <path key={part} ref={element => { const key = index * 2 + part; if (element) graph.paths.current.set(key, element); else graph.paths.current.delete(key); }} />)}
          <g ref={element => { const key = subNodes[index]!.page; if (element) graph.groups.current.set(key, element); else graph.groups.current.delete(key); }}>
            <foreignObject x={subNodes[index]!.x + 100 - subNodes[index]!.width / 2} y={subNodes[index]!.y - 4} width={subNodes[index]!.width} height="32">
              <div className="home-relation-subnode" data-page={subNodes[index]!.page} role="group" tabIndex={0}
                aria-label={`${nodes.find(node => node.page === edge.from)!.name}と${nodes.find(node => node.page === edge.to)!.name}の関係：${edge.label}`}
                onMouseEnter={() => setActive(subNodes[index]!.page)} onMouseLeave={() => setActive(null)} onFocus={() => focusNode(subNodes[index]!)} onBlur={() => setFocused(null)}>
                {edge.label}
              </div>
            </foreignObject>
          </g>
        </g>)}
        {nodes.map(node => <g key={node.page} ref={element => { if (element) graph.groups.current.set(node.page, element); else graph.groups.current.delete(node.page); }} className="home-relation-item"><foreignObject x={node.x - 6} y={node.y - 22} width="212" height="68">
          <button type="button" data-page={node.page} className={`home-relation-node${node.master ? " is-master" : ""}${node.page === "initiative-list" ? " is-entry" : ""}${related.has(node.page) ? " is-related" : ""}${active === node.page ? " is-selected" : ""}`}
            aria-pressed={selected === node.page} disabled={disabled} onMouseEnter={() => setActive(node.page)} onMouseLeave={() => setActive(null)} onFocus={() => focusNode({ ...node, width: 200, height: 56 })} onBlur={() => setFocused(null)} onClick={() => { if (selected === node.page) onNavigate(node.page); else setSelected(node.page); }}>
            <span className="home-relation-icon"><SidebarIcon name={node.icon} /></span>
            <span className="home-relation-name">{node.name}</span>
          </button>
        </foreignObject></g>)}
      </svg>
    </div>
    <div className="home-relations-legend" role="list" aria-label="関係の線の意味">
      {relationKinds.map(([kind, label]) => <span role="listitem" key={kind}>
        <svg viewBox="0 0 40 12" width="40" height="12" aria-hidden="true" className={`home-relation relation-${kind}`}>
          <path d={kind === "view" ? "M1 4 L39 4 M1 8 L39 8" : "M1 6 L39 6"} />
        </svg>{label}
      </span>)}
    </div>
    <div className="home-relations-controls" role="group" aria-label="相関図の表示操作">
      <button type="button" aria-label="拡大" onClick={() => zoomCenter(1.25)} disabled={camera.scale >= MAX_SCALE}>＋</button>
      <button type="button" aria-label="縮小" onClick={() => zoomCenter(.8)} disabled={camera.scale <= MIN_SCALE}>−</button>
      <button type="button" onClick={() => fit(true)}>全体表示</button>
    </div>
    </div>
  </main>;
}
