import { type RefObject } from "react";
import { useWindowViewState } from "./windowView";
import "./HomeRelations.css";
import { SidebarIcon } from "./SidebarIcon";
import { ScreenDataMap } from "./ScreenDataMap";
import { MechanismMap } from "./MechanismMap";
import { nodes, edges, subNodes, graphNodes, relationKinds, type HomeDestination } from "./home/homeRelations";
import { homeRelationDistances, isTablePage, relationDescription } from "./home/homeRelationLayout";
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
  const [mode, setMode] = useWindowViewState("home:mode", "relations");
  const { viewport, selected, setSelected, setActive, setFocused, active, camera, dragging, graph, focusNode, fit, zoomCenter, handlers } = useRelationGestures(view, disabled);
  const distances = homeRelationDistances(edges, selected);
  const isDirect = (edge: typeof edges[number]) => edge.from === selected || edge.to === selected;
  const isVisible = (edge: typeof edges[number]) => distances.has(edge.from) && distances.has(edge.to);
  const related = new Set(distances.keys());
  return <main className="home-relations" aria-label="ホーム">
    <header className="home-relations-heading"><h1>Home</h1>
      <div className="home-relations-mode" role="group" aria-label="ホームの表示">
        {([["relations", "関連図"], ["data", "画面とデータ"], ["calculation", "計算の仕組み"], ["process", "処理の流れ"]] as const).map(([id, name]) =>
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
      <svg className="home-relations-map" viewBox="0 0 1800 1100" aria-label="画面とマスタの関係" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        {edges.map((edge, index) => <g key={`${edge.from}-${edge.to}`} data-kind={edge.kind} className={`home-relation relation-${edge.kind}${isDirect(edge) ? " is-active" : isVisible(edge) ? " is-indirect" : edge.kind === "view" ? " is-peer" : " is-hidden"}`}>
          <title>{`${relationKinds.find(([kind]) => kind === edge.kind)![1]}：${edge.label}`}</title>
          <path ref={element => { if (element) graph.paths.current.set(index, element); else graph.paths.current.delete(index); }} />
          <g className={isVisible(edge) ? "" : "home-relation-description-hidden"} aria-hidden={!isVisible(edge)} ref={element => { const key = subNodes[index]!.page; if (element) graph.groups.current.set(key, element); else graph.groups.current.delete(key); }}>
            <foreignObject x={subNodes[index]!.x + 100 - subNodes[index]!.width / 2} y={subNodes[index]!.y + 12 - 14} width={subNodes[index]!.width} height="28">
              <div className="home-relation-subnode" data-page={subNodes[index]!.page} role="group" tabIndex={isVisible(edge) ? 0 : -1}
                aria-label={`${nodes.find(node => node.page === edge.from)!.name}と${nodes.find(node => node.page === edge.to)!.name}の関係：${relationDescription(edge, selected)}`}
                onMouseEnter={() => setActive(subNodes[index]!.page)} onMouseLeave={() => setActive(null)} onFocus={() => focusNode(subNodes[index]!)} onBlur={() => setFocused(null)}>
                {relationDescription(edge, selected)}
              </div>
            </foreignObject>
          </g>
        </g>)}
        <g className="home-relations-brand" ref={element => { if (element) graph.groups.current.set("brand", element); else graph.groups.current.delete("brand"); }} aria-label="Triadic">
          <foreignObject x={graphNodes.find(node => node.page === "brand")!.x + 15} y={graphNodes.find(node => node.page === "brand")!.y - 28} width="170" height="80"><div><strong>Triadic</strong></div></foreignObject>
        </g>
        {nodes.map(destination => {
          const node = graphNodes.find(item => item.page === destination.page)!;
          const core = isTablePage(node.page);
          return <g key={node.page} ref={element => { if (element) graph.groups.current.set(node.page, element); else graph.groups.current.delete(node.page); }} className={`home-relation-item${core ? " is-core" : ""}${selected && !related.has(destination.page) ? " is-muted" : (distances.get(destination.page) ?? 0) > 1 ? " is-indirect" : ""}`}>
          <foreignObject x={node.x + 100 - node.width / 2 - 8} y={node.y + 12 - node.height / 2 - 8} width={node.width + 16} height={node.height + 16}>
          <button type="button" data-page={node.page} className={`home-relation-node${destination.master ? " is-master" : ""}${core ? " is-core" : ""}${node.page === "initiative-list" ? " is-entry" : ""}${related.has(destination.page) ? " is-related" : ""}${active === node.page ? " is-selected" : ""}`}
            aria-pressed={selected === node.page} disabled={disabled} onMouseEnter={() => setActive(node.page)} onMouseLeave={() => setActive(null)} onFocus={() => focusNode(node)} onBlur={() => setFocused(null)} onClick={() => { if (selected === node.page) onNavigate(destination.page); else setSelected(node.page); }}>
            <span className="home-relation-icon"><SidebarIcon name={destination.icon} /></span>
            <span className="home-relation-name">{destination.name}</span>
          </button>
          </foreignObject></g>;
        })}
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
