import { useId, type ReactNode } from 'react';
import { contactMap, type PartContact } from '../core/tables/detailPartContact';

export type SurfaceContact = PartContact & { inset?: number };
/** Cubic outlines share both position and tangent along the entire contacting edge. */
export function contactOutline(width: number, height: number, contacts: SurfaceContact[]) {
  const inset = (side: PartContact['side']) => contacts.find(contact => contact.side === side)?.inset ?? 0;
  const left = inset('left'), right = width - inset('right'), top = inset('top'), bottom = height - inset('bottom');
  const r = Math.min(8, (right-left)/2, (bottom-top)/2);
  let path = `M ${left+r} ${top}`;
  function edge(side: PartContact['side'], from: number, to: number, base: number) {
    const vertical = side === 'left' || side === 'right';
    const sign = side === 'left' || side === 'top' ? 1 : -1;
    const list = contacts.filter(contact => contact.side === side);
    const position = (t: number) => {
      let displacement = 0, slope = 0;
      for (const contact of list) {
        const u = (t - contact.center) / contact.radius;
        if (Math.abs(u) < 1) {
          displacement += contact.depth * (1 + Math.cos(Math.PI*u)) / 2;
          slope -= contact.depth * Math.PI * Math.sin(Math.PI*u) / (2*contact.radius);
        }
      }
      return { value: base+sign*displacement, slope: sign*slope };
    };
    const point = (t: number, value: number) => vertical ? `${value} ${t}` : `${t} ${value}`;
    const stops = new Set([from,to]);
    // Identical global knots on both sides, with Hermite tangents at each knot.
    for (const contact of list) for (let i=0;i<=8;i++) {
      const t=contact.center-contact.radius+contact.radius*i/4;
      if(t>Math.min(from,to)&&t<Math.max(from,to)) stops.add(t);
    }
    const sorted=[...stops].sort((a,b)=>from<to?a-b:b-a);
    for(let i=1;i<sorted.length;i++) {
      const a=sorted[i-1]!, b=sorted[i]!, third=(b-a)/3, p=position(a), q=position(b);
      path+=` C ${point(a+third,p.value+p.slope*third)} ${point(b-third,q.value-q.slope*third)} ${point(b,q.value)}`;
    }
  }
  edge('top',left+r,right-r,top); path+=` Q ${right} ${top} ${right} ${top+r}`;
  edge('right',top+r,bottom-r,right); path+=` Q ${right} ${bottom} ${right-r} ${bottom}`;
  edge('bottom',right-r,left+r,bottom); path+=` Q ${left} ${bottom} ${left} ${bottom-r}`;
  edge('left',bottom-r,top+r,left); path+=` Q ${left} ${top} ${left+r} ${top} Z`;
  return path;
}

export function DetailContactFilter({ width, height, contacts, children }: { width: number; height: number; contacts: SurfaceContact[]; children: ReactNode }) {
  const id = useId().replaceAll(':','');
  const path = contactOutline(width,height,contacts);
  const active = contacts.some(contact => Math.abs(contact.depth) > .01);
  const contact = contacts[0];
  const inset = (side: PartContact['side']) => contacts.find(item => item.side === side)?.inset ?? 0;
  const left = inset('left'), right = inset('right'), top = inset('top'), bottom = inset('bottom');
  return <>
    <svg className="detail-contact-filter" data-depth={contact?.depth ?? 0} aria-hidden="true" width="0" height="0">
      <defs>
        <clipPath id={`${id}-clip`}><path d={path} transform="translate(-1 -1)"/></clipPath>
        {contact && <filter id={`${id}-bend`} filterUnits="userSpaceOnUse" x="-24" y="-24" width={width+48} height={height+48} colorInterpolationFilters="sRGB">
          <feImage href={contactMap(width,height,contact)} x="-24" y="-24" width={width+48} height={height+48} result="map" preserveAspectRatio="none"/>
          <feDisplacementMap in="SourceGraphic" in2="map" scale={contact.depth*2} xChannelSelector="R" yChannelSelector="G"/>
        </filter>}
      </defs>
    </svg>
    {active && <svg className="detail-contact-surface" width={width} height={height} aria-hidden="true"><path d={path} fill="var(--surface)"/></svg>}
    <div className="detail-part-content" style={{clipPath:active?`url(#${id}-clip)`:undefined}}>
      <div className="detail-part-content" style={{filter:active && contact?`url(#${id}-bend)`:undefined}}>
        <div className="detail-part-content" style={{transform:active?`translate(${left}px, ${top}px) scale(${(width-left-right)/width}, ${(height-top-bottom)/height})`:undefined, transformOrigin:'top left'}}>{children}</div>
      </div>
    </div>
    {active && <svg className="detail-contact-outline" width={width} height={height} aria-hidden="true"><path d={path} fill="none" stroke="var(--control-line)" strokeWidth="1"/></svg>}
  </>;
}
